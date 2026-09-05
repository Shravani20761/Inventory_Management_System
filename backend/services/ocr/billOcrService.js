import { PDFParse } from "pdf-parse";
import { emptyExtractedBill, parseBillTextHeuristics, isInsufficientExtraction } from "./billParseHeuristics.js";
import { preprocessBillImage } from "./imagePreprocess.js";

const MAX_PDF_PAGES = 20;
const MAX_VISION_PAGES = 8;

const EXTRACT_PROMPT = `You extract Indian GST purchase bills / tax invoices for a battery inventory business.
Return JSON only. Use null for missing numbers and "" for missing strings. NEVER invent products, quantities, prices, GST, invoice numbers, supplier names, HSN, AH, voltage, warranty, or totals.
If a value is unreadable, leave it blank/null and set low confidence (0-50).
Identify column meanings from THIS bill (column order varies by supplier). Merge multi-line product descriptions into ONE item. Do not treat HSN, warranty, serial, or continuation lines as extra products.
Include line items from EVERY page.
Schema:
{
  "invoiceNumber": "", "invoiceDate": "", "purchaseOrderNumber": "", "poDate": "", "dueDate": "",
  "paymentTerms": "", "placeOfSupply": "", "reverseCharge": "", "vehicleNumber": "", "deliveryNote": "",
  "supplierDetails": { "name":"", "legalName":"", "address":"", "phone":"", "email":"", "gstin":"", "pan":"", "state":"", "stateCode":"" },
  "buyerDetails": { "name":"", "legalName":"", "address":"", "billingAddress":"", "shippingAddress":"", "gstin":"", "state":"", "stateCode":"" },
  "items": [{
    "productName":"", "modelNumber":"", "sku":"", "brand":"", "category":"", "description":"",
    "hsn":"", "quantity":null, "unit":"", "rate":null, "mrp":null, "discount":null, "discountPercent":null, "taxableAmount":null,
    "gstRate":null, "cgstPercent":null, "sgstPercent":null, "igstPercent":null,
    "cgst":null, "sgst":null, "igst":null, "cess":null, "total":null,
    "serialNumber":"", "batchNumber":"", "warranty":"",
    "batteryType":"", "capacityAh":null, "voltage":null, "technology":"", "manufacturingDate":"",
    "confidence": null
  }],
  "subtotal": null, "discount": null, "taxableAmount": null, "cgst": null, "sgst": null, "igst": null, "cess": null,
  "otherCharges": null, "freight": null, "transportation": null, "packingCharges": null, "installationCharges": null, "roundOff": null,
  "grandTotal": null, "amountPaid": null, "balanceDue": null, "amountInWords": "",
  "fieldConfidence": { "invoiceNumber": 0, "grandTotal": 0 },
  "ocrConfidence": 0
}
fieldConfidence values are 0-100. Battery fields only if printed on the bill.`;

function mergeExtract(base, overlay) {
  const out = { ...emptyExtractedBill(), ...base, ...overlay };
  out.supplierDetails = { ...emptyExtractedBill().supplierDetails, ...(base.supplierDetails || {}), ...(overlay.supplierDetails || {}) };
  out.buyerDetails = { ...emptyExtractedBill().buyerDetails, ...(base.buyerDetails || {}), ...(overlay.buyerDetails || {}) };
  out.items = Array.isArray(overlay.items) && overlay.items.length ? overlay.items : base.items || [];
  out.fieldConfidence = { ...(base.fieldConfidence || {}), ...(overlay.fieldConfidence || {}) };
  return out;
}

async function ocrImageBuffer(buffer) {
  try {
    const Tesseract = (await import("tesseract.js")).default;
    const { data } = await Tesseract.recognize(buffer, "eng", { logger: () => {} });
    return String(data?.text || "").trim();
  } catch (e) {
    console.warn("[ocr] tesseract failed:", e.message);
    return "";
  }
}

async function extractPdfPages(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const pagesFromText = Array.isArray(textResult?.pages) ? textResult.pages : [];
    const combinedText = String(textResult?.text || "").trim();
    const declared = Number(textResult?.total || pagesFromText.length || 1) || 1;
    if (declared > MAX_PDF_PAGES) {
      const err = new Error(`PDF has ${declared} pages. Maximum allowed is ${MAX_PDF_PAGES}.`);
      err.status = 400;
      throw err;
    }
    let screenshots = [];
    try {
      const shots = await parser.getScreenshot({ imageBuffer: true, scale: 2 });
      screenshots = shots?.pages || [];
    } catch (e) {
      console.warn("[ocr] PDF screenshot failed:", e.message);
    }
    const pageCount = Math.max(declared, screenshots.length, 1);
    const pageBuffers = [];
    for (const page of screenshots) {
      const buf = page.data ? Buffer.from(page.data) : null;
      if (buf?.length) pageBuffers.push(buf);
    }
    return { text: combinedText, pageCount, pageBuffers };
  } catch (e) {
    if (e.status === 400) throw e;
    console.warn("[ocr] pdf-parse failed:", e.message);
    return { text: "", pageCount: 1, pageBuffers: [] };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function parseJsonLoose(raw) {
  const s = String(raw || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function visionPartsFromPages(pageBuffers, mimeFallback) {
  return pageBuffers.slice(0, MAX_VISION_PAGES).map((buf) => ({
    mime: "image/jpeg",
    data: buf.toString("base64"),
    fallback: mimeFallback,
  }));
}

async function extractWithGemini({ pdfBuffer, isPdf, pageBuffers, mime }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_OCR_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const parts = [{ text: EXTRACT_PROMPT }];
  if (isPdf && pdfBuffer?.length) {
    parts.push({ inline_data: { mime_type: "application/pdf", data: pdfBuffer.toString("base64") } });
  }
  const images = visionPartsFromPages(pageBuffers, mime);
  if (!isPdf && images.length === 0 && pdfBuffer) {
    parts.push({ inline_data: { mime_type: mime, data: pdfBuffer.toString("base64") } });
  }
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini OCR failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  return parseJsonLoose(text);
}

async function extractWithOpenAI({ pageBuffers, mime, singleBuffer }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";
  const images = pageBuffers.length
    ? pageBuffers.slice(0, MAX_VISION_PAGES)
    : singleBuffer
      ? [singleBuffer]
      : [];
  if (!images.length) return null;
  const content = [
    { type: "text", text: "Extract this purchase bill. Use every page image. Return JSON only." },
    ...images.map((buf) => ({
      type: "image_url",
      image_url: { url: `data:${mime.includes("pdf") ? "image/jpeg" : mime};base64,${buf.toString("base64")}` },
    })),
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI OCR failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  const json = await res.json();
  return parseJsonLoose(json?.choices?.[0]?.message?.content);
}

export async function extractPurchaseBill(buffer, mimetype = "image/jpeg") {
  const mime = String(mimetype || "image/jpeg");
  const isPdf = mime.includes("pdf");
  let engine = "heuristics";
  let rawText = "";
  let pageCount = 1;
  let extracted = emptyExtractedBill();
  let pageBuffers = [];

  if (isPdf) {
    const pdf = await extractPdfPages(buffer);
    rawText = pdf.text;
    pageCount = pdf.pageCount || 1;
    pageBuffers = [];
    for (const pageBuf of pdf.pageBuffers) {
      pageBuffers.push(await preprocessBillImage(pageBuf));
    }
    if (rawText.length < 80 && pageBuffers.length) {
      const pageTexts = [];
      for (const pageBuf of pageBuffers) {
        pageTexts.push(await ocrImageBuffer(pageBuf));
      }
      if (pageTexts.some(Boolean)) {
        rawText = pageTexts.filter(Boolean).join("\n\n----- PAGE -----\n\n");
        engine = "tesseract";
      }
    } else if (rawText.length > 80) {
      engine = "pdf-text";
    }
    if (rawText) extracted = parseBillTextHeuristics(rawText);
  } else {
    const processed = await preprocessBillImage(buffer);
    pageBuffers = [processed];
    rawText = await ocrImageBuffer(processed);
    if (rawText) {
      extracted = parseBillTextHeuristics(rawText);
      engine = "tesseract";
    }
  }

  try {
    const vision =
      (await extractWithGemini({ pdfBuffer: isPdf ? buffer : null, isPdf, pageBuffers, mime })) ||
      (await extractWithOpenAI({
        pageBuffers,
        mime: isPdf ? "image/jpeg" : mime,
        singleBuffer: isPdf ? null : pageBuffers[0] || buffer,
      }));
    if (vision && typeof vision === "object") {
      extracted = mergeExtract(extracted, vision);
      engine = process.env.GEMINI_API_KEY ? "gemini+local" : "openai+local";
    }
  } catch (e) {
    console.warn("[ocr] vision extract skipped:", e.message);
  }

  const insufficient = isInsufficientExtraction(extracted);
  return {
    extracted,
    rawText,
    pageCount,
    engine,
    insufficient,
    pageBuffers,
  };
}

export { isInsufficientExtraction, MAX_PDF_PAGES };

import { PDFParse } from "pdf-parse";
import { emptyExtractedBill, parseBillTextHeuristics, isInsufficientExtraction } from "./billParseHeuristics.js";

const EXTRACT_PROMPT = `You extract Indian GST purchase bills / tax invoices for BatteryMela.
Return JSON only. Use null for missing numbers and "" for missing strings. NEVER invent products, quantities, prices, GST, invoice numbers, supplier names, HSN, or totals.
If a value is unreadable, leave it blank/null and set low confidence (0-50).
Schema:
{
  "invoiceNumber": "",
  "invoiceDate": "",
  "purchaseOrderNumber": "",
  "supplierDetails": { "name":"", "address":"", "phone":"", "email":"", "gstin":"", "pan":"", "state":"", "stateCode":"" },
  "buyerDetails": { "name":"", "address":"", "billingAddress":"", "shippingAddress":"", "gstin":"", "state":"", "stateCode":"" },
  "items": [{
    "productName":"", "modelNumber":"", "sku":"", "brand":"", "category":"", "description":"",
    "hsn":"", "quantity":null, "unit":"", "rate":null, "discount":null, "taxableAmount":null,
    "gstRate":null, "cgst":null, "sgst":null, "igst":null, "cess":null, "total":null,
    "serialNumber":"", "batchNumber":"", "warranty":"", "confidence": null
  }],
  "subtotal": null, "discount": null, "taxableAmount": null, "cgst": null, "sgst": null, "igst": null, "cess": null,
  "otherCharges": null, "freight": null, "transportation": null, "installationCharges": null, "roundOff": null,
  "grandTotal": null, "amountPaid": null, "balanceDue": null, "amountInWords": "",
  "fieldConfidence": { "invoiceNumber": 0, "grandTotal": 0 },
  "ocrConfidence": 0
}
Include line items from EVERY page. fieldConfidence values are 0-100.`;

function mergeExtract(base, overlay) {
  const out = { ...emptyExtractedBill(), ...base, ...overlay };
  out.supplierDetails = { ...emptyExtractedBill().supplierDetails, ...(base.supplierDetails || {}), ...(overlay.supplierDetails || {}) };
  out.buyerDetails = { ...emptyExtractedBill().buyerDetails, ...(base.buyerDetails || {}), ...(overlay.buyerDetails || {}) };
  out.items = Array.isArray(overlay.items) && overlay.items.length ? overlay.items : base.items || [];
  out.fieldConfidence = { ...(base.fieldConfidence || {}), ...(overlay.fieldConfidence || {}) };
  return out;
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    let text = String(textResult?.text || "").trim();
    const pages = Number(textResult?.total || textResult?.pages?.length || 1) || 1;
    if (text.length < 80) {
      try {
        const shots = await parser.getScreenshot({ imageBuffer: true, scale: 2 });
        const pageTexts = [];
        for (const page of shots.pages || []) {
          const buf = page.data ? Buffer.from(page.data) : null;
          if (!buf?.length) continue;
          pageTexts.push(await ocrImageBuffer(buf));
        }
        if (pageTexts.some(Boolean)) text = pageTexts.filter(Boolean).join("\n\n");
      } catch (e) {
        console.warn("[ocr] PDF screenshot OCR skipped:", e.message);
      }
    }
    return { text, pages };
  } catch (e) {
    console.warn("[ocr] pdf-parse failed:", e.message);
    return { text: "", pages: 1 };
  } finally {
    await parser.destroy().catch(() => {});
  }
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

async function extractWithGemini(buffer, mime) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_OCR_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: EXTRACT_PROMPT },
            { inline_data: { mime_type: mime, data: buffer.toString("base64") } },
          ],
        },
      ],
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

async function extractWithOpenAI(buffer, mime) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";
  const isPdf = String(mime).includes("pdf");
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
        {
          role: "user",
          content: isPdf
            ? [
                { type: "text", text: "Extract this purchase bill PDF." },
                { type: "text", text: `(PDF base64 length ${buffer.length})` },
              ]
            : [
                { type: "text", text: "Extract this purchase bill image." },
                {
                  type: "image_url",
                  image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` },
                },
              ],
        },
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
  const isPdf = mime.includes("pdf") || mime.includes("application/octet-stream");
  let engine = "heuristics";
  let rawText = "";
  let pageCount = 1;
  let extracted = emptyExtractedBill();

  if (isPdf) {
    const pdf = await extractPdfText(buffer);
    rawText = pdf.text;
    pageCount = pdf.pages || 1;
    if (rawText.length > 80) {
      extracted = parseBillTextHeuristics(rawText);
      engine = "pdf-text";
    }
  } else {
    rawText = await ocrImageBuffer(buffer);
    if (rawText) {
      extracted = parseBillTextHeuristics(rawText);
      engine = "tesseract";
    }
  }

  try {
    const vision = (await extractWithGemini(buffer, isPdf ? "application/pdf" : mime)) || (await extractWithOpenAI(buffer, mime));
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
  };
}

export { isInsufficientExtraction };

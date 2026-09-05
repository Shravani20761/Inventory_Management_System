/**
 * OCR layer only: PDF text extraction and Tesseract.
 * Does not parse products, prices, GST, or invoice fields.
 */
import { PDFParse } from "pdf-parse";
import { preprocessBillImage } from "./imagePreprocess.js";
import { parsePurchaseBill, isInsufficientExtraction } from "./billParser.js";
import { normalizeBillText } from "./textNormalizer.js";
import { wordsFromTesseractData, normalizeOcrWord } from "./tableStructure.js";

const MAX_PDF_PAGES = 20;
const WEAK_PAGE_CHARS = 40;

async function ocrImageBuffer(buffer) {
  try {
    const Tesseract = (await import("tesseract.js")).default;
    const { data } = await Tesseract.recognize(buffer, "eng", {
      logger: () => {},
    });
    const text = String(data?.text || "").trim();
    const confidence = Number(data?.confidence);
    const words = wordsFromTesseractData(data, 1);
    const blocks = Array.isArray(data?.blocks)
      ? data.blocks.map((b) => ({
          text: String(b.text || "").trim(),
          confidence: Number.isFinite(Number(b.confidence)) ? Number(b.confidence) : null,
          bbox: b.bbox
            ? {
                x: b.bbox.x0 ?? b.bbox.x,
                y: b.bbox.y0 ?? b.bbox.y,
                width: (b.bbox.x1 ?? 0) - (b.bbox.x0 ?? 0),
                height: (b.bbox.y1 ?? 0) - (b.bbox.y0 ?? 0),
              }
            : null,
        }))
      : [];
    const lines = Array.isArray(data?.lines)
      ? data.lines.map((ln) => ({
          text: String(ln.text || "").trim(),
          confidence: Number(ln.confidence) || null,
          bbox: ln.bbox
            ? {
                x: ln.bbox.x0 ?? ln.bbox.x,
                y: ln.bbox.y0 ?? ln.bbox.y,
                width: (ln.bbox.x1 ?? 0) - (ln.bbox.x0 ?? 0),
                height: (ln.bbox.y1 ?? 0) - (ln.bbox.y0 ?? 0),
              }
            : null,
          words: Array.isArray(ln.words) ? ln.words.map((w) => normalizeOcrWord(w, 1)) : [],
        }))
      : [];
    return {
      text,
      confidence: Number.isFinite(confidence) ? confidence : null,
      lines,
      words,
      blocks,
    };
  } catch (e) {
    console.warn("[ocr] tesseract failed:", e.message);
    return { text: "", confidence: null, lines: [], words: [], blocks: [] };
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
    const pageCount = Math.max(declared, screenshots.length, pagesFromText.length, 1);
    const pageBuffers = [];
    for (const page of screenshots) {
      const buf = page.data ? Buffer.from(page.data) : null;
      if (buf?.length) pageBuffers.push(buf);
    }
    const pageTexts = [];
    for (let i = 0; i < pageCount; i += 1) {
      const fromPdf = String(pagesFromText[i]?.text || pagesFromText[i] || "").trim();
      pageTexts.push(fromPdf);
    }
    return { text: combinedText, pageCount, pageBuffers, pageTexts };
  } catch (e) {
    if (e.status === 400) throw e;
    console.warn("[ocr] pdf-parse failed:", e.message);
    return { text: "", pageCount: 1, pageBuffers: [], pageTexts: [] };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Read characters from the document. Returns text + optional page/confidence metadata.
 */
export async function extractBillText(buffer, mimetype = "image/jpeg") {
  const mime = String(mimetype || "image/jpeg");
  const isPdf = mime.includes("pdf");
  const pages = [];
  let engine = "none";
  let pageBuffers = [];
  let pageCount = 1;

  if (isPdf) {
    const pdf = await extractPdfPages(buffer);
    pageCount = pdf.pageCount || 1;
    pageBuffers = [];
    for (const pageBuf of pdf.pageBuffers) {
      pageBuffers.push(await preprocessBillImage(pageBuf));
    }
    for (let i = 0; i < pageCount; i += 1) {
      let text = String(pdf.pageTexts[i] || "").trim();
      let confidence = null;
      let lines = [];
      let words = [];
      let blocks = [];
      if (pageBuffers[i]) {
        const ocr = await ocrImageBuffer(pageBuffers[i]);
        words = (ocr.words || []).map((w) => ({ ...w, page: i + 1 }));
        lines = ocr.lines || [];
        blocks = ocr.blocks || [];
        if (Number.isFinite(ocr.confidence)) confidence = ocr.confidence;
        if (text.length < WEAK_PAGE_CHARS && ocr.text) {
          text = ocr.text;
          engine = engine === "pdf-text" ? "pdf-text+tesseract" : "tesseract";
        } else if (text) {
          engine = "pdf-text+tesseract";
        } else if (ocr.text) {
          text = ocr.text;
          engine = "tesseract";
        }
      } else if (text) {
        engine = engine === "tesseract" ? "pdf-text+tesseract" : "pdf-text";
      }
      pages.push({ page: i + 1, text, confidence, lines, words, blocks });
    }
    if (!pages.some((p) => p.text) && pageBuffers.length) {
      for (let i = 0; i < pageBuffers.length; i += 1) {
        const ocr = await ocrImageBuffer(pageBuffers[i]);
        pages[i] = {
          page: i + 1,
          text: ocr.text,
          confidence: ocr.confidence,
          lines: ocr.lines,
          words: (ocr.words || []).map((w) => ({ ...w, page: i + 1 })),
        };
      }
      engine = "tesseract";
    }
  } else {
    const processed = await preprocessBillImage(buffer);
    pageBuffers = [processed];
    const ocr = await ocrImageBuffer(processed);
    engine = ocr.text ? "tesseract" : "none";
    pages.push({
      page: 1,
      text: ocr.text,
      confidence: ocr.confidence,
      lines: ocr.lines,
      words: (ocr.words || []).map((w) => ({ ...w, page: 1 })),
      blocks: ocr.blocks || [],
    });
    pageCount = 1;
  }

  const rawText = pages
    .map((p) => (pages.length > 1 ? `\n\n----- PAGE ${p.page} -----\n\n${p.text}` : p.text))
    .join("")
    .trim();
  const confidences = pages.map((p) => p.confidence).filter((c) => typeof c === "number");
  const ocrConfidence = confidences.length
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : null;

  return {
    rawText,
    normalizedText: normalizeBillText(rawText),
    pages,
    pageCount,
    pageBuffers,
    engine,
    ocrConfidence,
    mime,
  };
}

/** OCR → normalize → custom parser. No external AI. */
export async function extractPurchaseBill(buffer, mimetype = "image/jpeg") {
  const ocr = await extractBillText(buffer, mimetype);
  const extracted = parsePurchaseBill(ocr.normalizedText || ocr.rawText, {
    pages: ocr.pages,
    ocrConfidence: ocr.ocrConfidence,
  });
  const insufficient = isInsufficientExtraction(extracted);
  return {
    extracted,
    rawText: ocr.rawText,
    pageCount: ocr.pageCount,
    engine: ocr.engine === "none" ? "parser" : ocr.engine,
    insufficient,
    pageBuffers: ocr.pageBuffers,
    pages: ocr.pages,
    ocrConfidence: ocr.ocrConfidence,
  };
}

export { isInsufficientExtraction, MAX_PDF_PAGES };

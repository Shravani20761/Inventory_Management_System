/**
 * OCR-only image cleanup. Never overwrites the original uploaded buffer.
 * Failures return the input buffer so OCR can still run.
 */
export async function preprocessBillImage(buffer) {
  if (!buffer?.length) return buffer;
  try {
    const sharp = (await import("sharp")).default;
    let img = sharp(buffer, { failOn: "none", sequentialRead: true }).rotate();
    const meta = await img.metadata();
    const width = Number(meta.width) || 0;
    const height = Number(meta.height) || 0;
    if (width > 0 && width < 1400) {
      img = img.resize({ width: Math.min(2000, Math.round(width * 1.6)), withoutEnlargement: false });
    } else if (width > 4200) {
      img = img.resize({ width: 3200, withoutEnlargement: true });
    }
    if (height > 0 && height < 900 && width >= 1400) {
      img = img.resize({ height: 1400, withoutEnlargement: false });
    }
    const out = await img
      .normalize()
      .modulate({ brightness: 1.05, saturation: 0.85 })
      .sharpen({ sigma: 1.1 })
      .median(1)
      .trim({ threshold: 16 })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out?.length ? out : buffer;
  } catch (e) {
    console.warn("[ocr] image preprocess skipped:", e.message);
    return buffer;
  }
}

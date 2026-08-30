import fs from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function configure() {
  if (!isConfigured()) return false;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return true;
}

export function getCloudinaryConfigStatus() {
  return { configured: isConfigured() };
}

/**
 * Upload invoice PDF permanently to Cloudinary (invoices only — not quotations).
 * @returns {Promise<string>} secure public URL
 */
export async function uploadInvoicePdf(filePath, invoiceNumber) {
  if (!configure()) {
    const err = new Error("Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env");
    err.status = 503;
    throw err;
  }

  await fs.access(filePath);
  const safeId = String(invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, "");

  console.log("[cloudinary] Uploading invoice PDF:", safeId);

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "raw",
    folder: "battery-invoices",
    public_id: safeId,
    overwrite: true,
    type: "upload",
  });

  const url = result.secure_url;
  console.log("[cloudinary] Invoice uploaded:", url);
  return url;
}

/**
 * Upload a product / marketing image (JPEG/PNG/WebP) for inventory or branding.
 * @returns {Promise<string>} secure HTTPS URL
 */
export async function uploadInventoryProductImage(buffer, mimetype = "image/jpeg", { folder = "batterymela/inventory", publicId } = {}) {
  if (!configure()) {
    const err = new Error(
      "Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env",
    );
    err.status = 503;
    throw err;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error("Empty image buffer");
    err.status = 400;
    throw err;
  }
  const safeId = String(publicId || `img-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
  const mime = String(mimetype || "image/jpeg").includes("/") ? mimetype : "image/jpeg";
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: safeId,
    overwrite: true,
    resource_type: "image",
  });

  return result.secure_url;
}

/**
 * Upload a purchase bill image or PDF. Falls back to local /generated when Cloudinary is unset.
 * @returns {Promise<{ url: string, storage: string }>}
 */
export async function uploadPurchaseBillFile(buffer, mimetype = "application/pdf", { publicId } = {}) {
  const mime = String(mimetype || "application/octet-stream");
  const isPdf = mime.includes("pdf");
  if (configure()) {
    const safeId = String(publicId || `bill-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
    const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "batterymela/purchase-bills",
      public_id: safeId,
      overwrite: true,
      resource_type: isPdf ? "raw" : "image",
    });
    return { url: result.secure_url, storage: "cloudinary" };
  }

  const dir = path.join(process.cwd(), "generated", "purchase-bills");
  await fs.mkdir(dir, { recursive: true });
  const ext = isPdf ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const name = `${String(publicId || `bill-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "")}.${ext}`;
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buffer);
  const base = process.env.PUBLIC_BASE_URL || "";
  const url = `${String(base).replace(/\/$/, "")}/generated/purchase-bills/${name}`;
  return { url, storage: "local" };
}

/**
 * Upload quotation PDF for Meta WhatsApp (must be public HTTPS).
 * @returns {Promise<string>} secure public URL
 */
export async function uploadQuotationPdfForWhatsApp(filePath, quoteKey) {
  if (!configure()) {
    const err = new Error("Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env");
    err.status = 503;
    throw err;
  }

  await fs.access(filePath);
  const safeId = String(quoteKey || "quotation").replace(/[^a-zA-Z0-9_-]/g, "");

  console.log("[cloudinary] Uploading quotation PDF for WhatsApp:", safeId);

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "raw",
    folder: "battery-quotations",
    public_id: safeId,
    overwrite: true,
    type: "upload",
  });

  const url = result.secure_url;
  console.log("[cloudinary] Quotation PDF uploaded:", url);
  return url;
}

import fs from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

let authCache = { checked: false, ok: null, error: "" };

function stripCred(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
}

function cloudNameFromRaw(raw) {
  const v = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
  const hosted = v.match(/res\.cloudinary\.com\/([^/?#]+)/i);
  if (hosted) return stripCred(hosted[1]);
  if (/^cloudinary:\/\//i.test(v)) {
    try {
      return stripCred(new URL(v).hostname);
    } catch {
      /* ignore */
    }
  }
  return stripCred(v);
}

function readCloudinaryCredentials() {
  const urlRaw = String(process.env.CLOUDINARY_URL || "").trim();
  if (urlRaw && /^cloudinary:\/\//i.test(urlRaw)) {
    try {
      const u = new URL(urlRaw);
      const cloud_name = stripCred(u.hostname);
      const api_key = stripCred(decodeURIComponent(u.username || ""));
      const api_secret = stripCred(decodeURIComponent(u.password || ""));
      if (cloud_name && api_key && api_secret) {
        return { cloud_name, api_key, api_secret, source: "CLOUDINARY_URL" };
      }
    } catch {
      /* fall through to discrete vars */
    }
  }
  const cloud_name = cloudNameFromRaw(process.env.CLOUDINARY_CLOUD_NAME);
  const api_key = stripCred(process.env.CLOUDINARY_API_KEY);
  const api_secret = stripCred(process.env.CLOUDINARY_API_SECRET);
  if (cloud_name && api_key && api_secret) {
    return { cloud_name, api_key, api_secret, source: "CLOUDINARY_*" };
  }
  return null;
}

function isConfigured() {
  return Boolean(readCloudinaryCredentials());
}

function configure() {
  const creds = readCloudinaryCredentials();
  if (!creds) return false;
  try {
    cloudinary.config(true);
  } catch (e) {
    console.warn("[cloudinary] Reset from CLOUDINARY_URL skipped:", redactCloudinaryMessage(e.message));
  }
  cloudinary.config({
    cloud_name: creds.cloud_name,
    api_key: creds.api_key,
    api_secret: creds.api_secret,
    secure: true,
    signature_version: Number(process.env.CLOUDINARY_SIGNATURE_VERSION || 1),
    signature_algorithm: process.env.CLOUDINARY_SIGNATURE_ALGORITHM || "sha1",
  });
  return true;
}

export function redactCloudinaryMessage(msg) {
  return String(msg || "")
    .replace(/Invalid Signature [a-f0-9]+\.?/gi, "Invalid Signature")
    .replace(/String to sign - '[^']*'/gi, "String to sign redacted")
    .replace(/api_secret[^\s]*/gi, "api_secret");
}

export function getCloudinaryConfigStatus() {
  return {
    configured: isConfigured(),
    authOk: authCache.checked ? authCache.ok : null,
  };
}

export async function verifyCloudinaryAuth() {
  if (!configure()) {
    authCache = { checked: true, ok: false, error: "not_configured" };
    return authCache;
  }
  try {
    await cloudinary.api.ping();
    authCache = { checked: true, ok: true, error: "" };
    console.log("[cloudinary] Credentials accepted (same cloud / key / secret)");
  } catch (e) {
    const msg = redactCloudinaryMessage(e.message || e.error?.message || "auth failed");
    authCache = { checked: true, ok: false, error: msg };
    console.error(
      "[cloudinary] Credential check failed:",
      msg,
      "— CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must belong to the same Cloudinary cloud. Remove spaces from the cloud name.",
    );
  }
  return authCache;
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

async function storeLocalPurchaseBill(buffer, mimetype, publicId) {
  const mime = String(mimetype || "application/octet-stream");
  const isPdf = mime.includes("pdf");
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
  const result = await uploadBuffer(buffer, {
    folder,
    public_id: safeId,
    overwrite: true,
    resource_type: "image",
  });

  return result.secure_url;
}

/**
 * Upload a purchase bill image or PDF. Falls back to local /generated when Cloudinary is unset or rejects the signature.
 * @returns {Promise<{ url: string, storage: string }>}
 */
export async function uploadPurchaseBillFile(buffer, mimetype = "application/pdf", { publicId } = {}) {
  const mime = String(mimetype || "application/octet-stream");
  const isPdf = mime.includes("pdf");
  const safeId = String(publicId || `bill-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");

  if (configure()) {
    try {
      const result = await uploadBuffer(buffer, {
        folder: "batterymela/purchase-bills",
        public_id: safeId,
        resource_type: isPdf ? "raw" : "image",
      });
      if (result?.secure_url) {
        return { url: result.secure_url, storage: "cloudinary" };
      }
    } catch (e) {
      console.error("[cloudinary] purchase-bill upload failed:", redactCloudinaryMessage(e.message || e));
    }
  }

  return storeLocalPurchaseBill(buffer, mime, safeId);
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

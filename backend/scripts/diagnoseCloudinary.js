/**
 * Diagnose Cloudinary env + signed upload without printing secrets.
 * Run: node --use-system-ca scripts/diagnoseCloudinary.js
 */
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

function inspect(name) {
  const raw = process.env[name];
  if (raw == null || raw === "") return { name, set: false };
  const trimmed = String(raw).trim().replace(/^['"]|['"]$/g, "");
  return {
    name,
    set: true,
    length: raw.length,
    trimmedLength: trimmed.length,
    hasWhitespace: raw !== raw.trim(),
    hasQuotes: /^['"]/.test(raw.trim()) && /['"]$/.test(raw.trim()),
    hasInternalWhitespace: /\s/.test(raw.trim()),
  };
}

function cleanCred(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
}

const names = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_URL"];
console.log("[diag] env hygiene", names.map(inspect));

const cloud = cleanCred(process.env.CLOUDINARY_CLOUD_NAME);
const key = cleanCred(process.env.CLOUDINARY_API_KEY);
const secret = cleanCred(process.env.CLOUDINARY_API_SECRET);

if (!cloud || !key || !secret) {
  console.log("[diag] missing credentials — cannot ping Cloudinary");
  process.exit(2);
}

console.log("[diag] after whitespace strip", {
  cloudLen: cloud.length,
  keyLen: key.length,
  secretLen: secret.length,
  cloudCharsetOk: /^[a-zA-Z0-9_-]+$/.test(cloud),
});

cloudinary.config({
  cloud_name: cloud,
  api_key: key,
  api_secret: secret,
  secure: true,
  signature_version: 1,
});

console.log("[diag] cloud_name charset ok", /^[a-zA-Z0-9_-]+$/.test(cloud), "key digits", /^\d+$/.test(key));

try {
  const ping = await cloudinary.api.ping();
  console.log("[diag] admin ping", ping?.status || ping);
} catch (e) {
  console.log("[diag] admin ping FAILED", {
    http: e.http_code || e.status,
    name: e.name,
    msg: String(e.message || e.error?.message || JSON.stringify(e)).slice(0, 240),
  });
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function tryUpload(label, opts) {
  try {
    const result = await cloudinary.uploader.upload(`data:image/png;base64,${png.toString("base64")}`, opts);
    console.log("[diag] upload OK", label, Boolean(result.secure_url));
  } catch (e) {
    console.log("[diag] upload FAIL", label, e.http_code || "", String(e.message || e).slice(0, 240));
  }
}

await tryUpload("purchase-bills-datauri", {
  folder: "batterymela/purchase-bills",
  public_id: `pb-diag-${Date.now()}`,
  overwrite: true,
  resource_type: "image",
});

await tryUpload("no-overwrite", {
  folder: "batterymela/purchase-bills",
  public_id: `pb-diag2-${Date.now()}`,
  resource_type: "image",
});

cloudinary.config({ signature_algorithm: "sha256" });
await tryUpload("sha256", {
  folder: "batterymela/purchase-bills",
  public_id: `pb-diag3-${Date.now()}`,
  resource_type: "image",
});

cloudinary.config({ signature_algorithm: "sha1", signature_version: 2 });
await tryUpload("timestamp-only", {
  resource_type: "image",
});

process.exit(0);

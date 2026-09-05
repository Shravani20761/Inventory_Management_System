import { redactCloudinaryMessage } from "../services/cloudinaryService.js";

export function errorHandler(err, _req, res, _next) {
  void _next;
  const raw = String(err?.message || err || "Server error");
  const cloudinaryFail = /invalid signature|api_secret mismatch|cloudinary/i.test(raw);
  console.error("[api]", redactCloudinaryMessage(raw), err?.stack || "");

  if (cloudinaryFail) {
    return res.status(err.status || 502).json({
      success: false,
      stage: err.stage || "cloudinary_upload",
      code: err.code || "CLOUDINARY_SIGNATURE_ERROR",
      error: "Bill file storage failed. Please contact the administrator.",
      message: "Bill file storage failed. Please contact the administrator.",
    });
  }

  const body = {
    error: raw || "Server error",
  };
  if (process.env.NODE_ENV !== "production" && err.stack) {
    body.details = err.stack;
  }
  res.status(err.status ?? 500).json(body);
}

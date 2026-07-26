export function errorHandler(err, _req, res, _next) {
  void _next;
  console.error("[api]", err?.message || err, err?.stack || "");
  const body = {
    error: err.message || "Server error",
  };
  if (process.env.NODE_ENV !== "production" && err.stack) {
    body.details = err.stack;
  }
  res.status(err.status ?? 500).json(body);
}

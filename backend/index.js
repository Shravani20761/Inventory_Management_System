import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, ".env");
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  if (!fs.existsSync(envPath)) {
    console.warn(`[config] No .env file at ${envPath}. Create it from .env.example (MONGODB_URI, JWT_SECRET, bootstrap admin).`);
  } else {
    console.warn(`[config] Could not parse .env: ${envResult.error.message}`);
  }
} else {
  console.log(`[config] Loaded environment from ${envPath}`);
}

console.log("[startup] Battery Inventory API boot starting…");
console.log(`[startup] NODE_ENV=${process.env.NODE_ENV || "undefined"} PORT=${process.env.PORT || 3001}`);
console.log(`[startup] MONGODB_URI is ${process.env.MONGODB_URI ? "set" : "MISSING"}`);
console.log(`[startup] PUBLIC_BASE_URL=${process.env.PUBLIC_BASE_URL || "(not set)"}`);
console.log(`[startup] FRONTEND_ORIGIN=${process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "(allow all)"}`);
import { connectMongo, isMongoConnected } from "./config/mongodb.js";
import "./config/registerCatalogModels.js";
import { bootstrapAdminIfEmpty } from "./services/authService.js";
import { requireAuth, requireRoles } from "./middleware/authMiddleware.js";
import { profileController, registerController } from "./controllers/authController.js";

import authRoutes from "./routes/auth.js";
import inventoryRoutes from "./routes/inventory.js";
import purchasesRoutes from "./routes/purchases.js";
import salesRoutes from "./routes/sales.js";
import quotationsRoutes from "./routes/quotations.js";
import recommendationsRoutes from "./routes/recommendations.js";
import invoicesRoutes from "./routes/invoices.js";
import productsRoutes from "./routes/products.js";
import combosRoutes from "./routes/combos.js";
import reportsRoutes from "./routes/reports.js";
import accountsRoutes from "./routes/accounts.js";
import documentsRoutes from "./routes/documents.js";
import uploadRoutes from "./routes/upload.js";
import inventoryCategoryRoutes from "./routes/inventoryCategoryRoutes.js";
import syncRoutes from "./routes/sync.js";
import usersRoutes from "./routes/users.js";
import branchesRoutes from "./routes/branches.js";
import stockTransfersRoutes from "./routes/stockTransfers.js";
import purchaseManagementRoutes from "./routes/purchaseManagement.js";
import vehiclesRoutes from "./routes/vehicles.js";

import { recommendComboController } from "./controllers/comboController.js";
import { generateInvoiceController } from "./controllers/invoiceController.js";
import { generateQuotationController, previewQuotationOptionsController } from "./controllers/quotationController.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { getWhatsAppConfigStatus, verifyMetaWebhook } from "./services/whatsappService.js";
import { getCloudinaryConfigStatus } from "./services/cloudinaryService.js";
import { startQuotationCleanupCron, GENERATED_DIR, publicBaseUrl } from "./services/quotationStorageService.js";
import { startPurchaseReminderCron } from "./services/purchaseReminderService.js";
import Battery from "./models/BatteryWriteTest.js";

const PORT = process.env.PORT || 3001;
const app = express();

/** Separate Hostinger frontend origin(s), comma-separated. Empty = allow all (dev). */
const corsOrigin = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigin
      ? {
          origin: corsOrigin.split(",").map((s) => s.trim()).filter(Boolean),
          credentials: true,
        }
      : true,
  ),
);
app.use(express.json({ limit: "15mb" }));
app.use("/generated", express.static(GENERATED_DIR));

app.get("/api/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verified = verifyMetaWebhook(mode, token, challenge);
  if (verified) return res.status(200).send(verified);
  res.sendStatus(403);
});

app.get("/api/health", (req, res) => {
  const dbOk = isMongoConnected();
  const payload = {
    ok: true,
    status: "up",
    database: dbOk ? "mongodb" : "disconnected",
    whatsapp: getWhatsAppConfigStatus(),
    cloudinary: getCloudinaryConfigStatus(),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`,
    timestamp: new Date().toISOString(),
  };
  console.log(
    `[health] GET /api/health → ok=${payload.ok} database=${payload.database} from=${req.ip || req.socket?.remoteAddress || "unknown"}`,
  );
  res.json(payload);
});

app.use("/api/auth", authRoutes);
/** Spec-style aliases (same handlers as /api/auth/*) */
app.get("/api/profile", requireAuth, profileController);
app.post("/api/register", requireAuth, requireRoles("superAdmin", "admin"), registerController);

const protectedApi = express.Router();
protectedApi.use(requireAuth);
protectedApi.use("/inventory", inventoryRoutes);
protectedApi.use("/products", productsRoutes);
protectedApi.use("/purchases", purchasesRoutes);
protectedApi.use("/purchase-management", purchaseManagementRoutes);
protectedApi.use("/sales", salesRoutes);
protectedApi.use("/quotations", quotationsRoutes);
protectedApi.use("/recommendations", recommendationsRoutes);
protectedApi.use("/invoices", invoicesRoutes);
protectedApi.use("/combos", combosRoutes);
protectedApi.use("/reports", reportsRoutes);
protectedApi.use("/accounts", accountsRoutes);
protectedApi.use("/documents", documentsRoutes);
protectedApi.use("/upload", uploadRoutes);
protectedApi.use("/stock-transfers", stockTransfersRoutes);
protectedApi.use("/sync", syncRoutes);
protectedApi.use("/users", usersRoutes);
protectedApi.use("/branches", branchesRoutes);
protectedApi.use("/vehicles", vehiclesRoutes);
protectedApi.use("/", inventoryCategoryRoutes);
protectedApi.post("/recommend-combo", recommendComboController);
protectedApi.post("/generate-quotation", generateQuotationController);
protectedApi.post("/preview-quotation-options", previewQuotationOptionsController);
protectedApi.post("/generate-invoice", generateInvoiceController);

app.use("/api", protectedApi);

console.log("[startup] Connecting to MongoDB…");
await connectMongo();
console.log("[startup] MongoDB ready — running bootstrap (if needed)…");
await bootstrapAdminIfEmpty();
console.log("[startup] Bootstrap complete — binding HTTP server…");

/**
 * Manual MongoDB write check — look in Atlas for collection `battery_write_tests`.
 * Remove or protect this route before any public deployment.
 */
if (process.env.NODE_ENV !== "production") {
app.get("/api/test", async (req, res, next) => {
  try {
    const testBattery = await Battery.create({
      brand: "Amaron",
      model: "150Ah",
      price: 12000,
    });
    res.json({
      ok: true,
      message: "Inserted one document. In Atlas: database from MONGODB_URI → collection battery_write_tests",
      document: testBattery.toObject ? testBattery.toObject() : testBattery,
    });
  } catch (err) {
    next(err);
  }
});
}

app.use(errorHandler);

process.on("unhandledRejection", (err) => {
  console.error("[api] Unhandled rejection:", err);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  const wa = getWhatsAppConfigStatus();
  const cloud = getCloudinaryConfigStatus();
  const dbOk = isMongoConnected();
  console.log("============================================================");
  console.log("[startup] SUCCESS — Battery Inventory API is running");
  console.log(`[startup] Listening on 0.0.0.0:${PORT}`);
  console.log(`[startup] Health check: GET /api/health`);
  console.log(`[startup] Database: ${dbOk ? "CONNECTED" : "DISCONNECTED"}`);
  console.log(`[startup] Public base URL: ${publicBaseUrl()}`);
  console.log("============================================================");
  console.log(`[static] Quotation PDFs: ${GENERATED_DIR}`);
  if (!wa.configured) {
    console.warn("[whatsapp] Meta API not configured — set META_ACCESS_TOKEN and META_PHONE_NUMBER_ID in .env");
  } else {
    console.log("[whatsapp] Meta Cloud API ready");
  }
  if (!cloud.configured) {
    console.warn("[cloudinary] Not configured — invoices need CLOUDINARY_* in .env");
  } else {
    console.log("[cloudinary] Ready for invoice uploads");
  }
  if (/localhost|127\.0\.0\.1/i.test(publicBaseUrl())) {
    console.warn(
      "[urls] PUBLIC_BASE_URL is localhost — PDF links / WhatsApp will fail on other devices and Meta cannot download the file.",
      "Set PUBLIC_BASE_URL to a public HTTPS base in .env and restart.",
    );
  }
  startQuotationCleanupCron();
  startPurchaseReminderCron();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[api] Port ${PORT} is already in use. Stop the old server (Task Manager → Node.js) or run:\n` +
        `  Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
    );
    process.exit(1);
  }
  throw err;
});

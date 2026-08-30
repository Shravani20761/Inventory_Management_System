import { Router } from "express";
import multer from "multer";
import {
  listPurchaseBillsController,
  getPurchaseBillController,
  uploadPurchaseBillController,
  retryOcrController,
  manualBillController,
  saveReviewController,
  confirmBillController,
  duplicateCheckController,
} from "../controllers/purchaseBillController.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /pdf|jpeg|jpg|png|webp|image/i.test(file.mimetype || "") || /\.(pdf|jpe?g|png|webp)$/i.test(file.originalname || "");
    if (!ok) return cb(new Error("Only JPG, JPEG, PNG, WEBP, or PDF files are allowed"));
    cb(null, true);
  },
});

const router = Router();

router.get("/", listPurchaseBillsController);
router.post("/check-duplicate", duplicateCheckController);
router.post("/manual", manualBillController);
router.post("/upload", upload.single("file"), uploadPurchaseBillController);
router.get("/:id", getPurchaseBillController);
router.put("/:id", saveReviewController);
router.post("/:id/retry-ocr", upload.single("file"), retryOcrController);
router.post("/:id/confirm", confirmBillController);

export default router;

import { Router } from "express";
import {
  getQuotationController,
  listQuotationsController,
  previewQuotationOptionsController,
  deleteAllQuotationsController,
  updateQuotationController,
  generateQuotationPdfController,
  sendQuotationWhatsAppController,
  approveAndSendQuotationWhatsAppController,
  setQuotationStatusController,
} from "../controllers/quotationController.js";

const router = Router();

router.get("/", listQuotationsController);
router.delete("/", deleteAllQuotationsController);
router.post("/preview-options", previewQuotationOptionsController);
router.put("/:id/status", setQuotationStatusController);
router.put("/:id", updateQuotationController);
router.post("/:id/generate-pdf", generateQuotationPdfController);
router.post("/:id/approve-send-whatsapp", approveAndSendQuotationWhatsAppController);
router.post("/:id/whatsapp", sendQuotationWhatsAppController);
router.get("/:id", getQuotationController);

export default router;

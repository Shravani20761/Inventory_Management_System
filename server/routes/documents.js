import { Router } from "express";
import {
  generateQuotationPdfController,
  sendQuotationWhatsAppController,
} from "../controllers/documentController.js";

const router = Router();

router.post("/quotations/:id/pdf", generateQuotationPdfController);
router.post("/quotations/:id/whatsapp", sendQuotationWhatsAppController);

export default router;

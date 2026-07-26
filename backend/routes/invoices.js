import { Router } from "express";
import {
  generateInvoiceController,
  getInvoiceController,
  listInvoicesController,
  prepareInvoiceFromQuotationController,
  updateInvoiceController,
} from "../controllers/invoiceController.js";

const router = Router();

router.get("/", listInvoicesController);
router.post("/prepare-from-quotation", prepareInvoiceFromQuotationController);
router.get("/:id", getInvoiceController);
router.post("/", generateInvoiceController);
router.put("/:id", updateInvoiceController);

export default router;

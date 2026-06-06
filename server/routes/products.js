import { Router } from "express";
import {
  bulkProductsController,
  createProductController,
  deleteProductController,
  getProductController,
  listProductsController,
  updateProductController,
} from "../controllers/productController.js";

const router = Router();

router.get("/", listProductsController);
router.get("/:id", getProductController);
router.post("/", createProductController);
router.post("/bulk", bulkProductsController);
router.put("/:id", updateProductController);
router.delete("/:id", deleteProductController);

export default router;

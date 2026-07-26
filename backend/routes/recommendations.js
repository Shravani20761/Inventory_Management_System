import { Router } from "express";
import {
  finalizeQuotationController,
  getRecommendationController,
  listRecommendationsController,
  saveRecommendationController,
} from "../controllers/recommendationController.js";

const router = Router();

router.get("/", listRecommendationsController);
router.post("/", saveRecommendationController);
router.post("/finalize-quotation", finalizeQuotationController);
router.get("/:id", getRecommendationController);

export default router;

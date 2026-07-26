import { Router } from "express";
import { recommendComboController } from "../controllers/comboController.js";

const router = Router();

router.post("/recommend", recommendComboController);

export default router;

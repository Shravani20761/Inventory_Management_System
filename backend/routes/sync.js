import { Router } from "express";
import { getSyncAllController, putSyncAllController } from "../controllers/syncController.js";

const router = Router();

router.get("/all", getSyncAllController);
router.put("/all", putSyncAllController);

export default router;

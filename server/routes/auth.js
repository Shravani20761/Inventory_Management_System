import { Router } from "express";
import { loginController, registerController, profileController } from "../controllers/authController.js";
import { requireAuth, requireRoles } from "../middleware/authMiddleware.js";

const router = Router();
router.post("/login", loginController);
router.get("/profile", requireAuth, profileController);
router.post("/register", requireAuth, requireRoles("superAdmin", "admin"), registerController);

export default router;

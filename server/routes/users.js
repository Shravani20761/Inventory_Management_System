import { Router } from "express";
import { requirePermission, requireRoles } from "../middleware/authMiddleware.js";
import { listUsersController, createUserController } from "../controllers/usersController.js";

const router = Router();
router.get("/", requireRoles("superAdmin", "admin"), requirePermission("users"), listUsersController);
router.post("/", requireRoles("superAdmin", "admin"), requirePermission("users"), createUserController);

export default router;

import { Router } from "express";
import { requirePermission, requireRoles } from "../middleware/authMiddleware.js";
import {
  listUsersController,
  createUserController,
  updateUserController,
  resetPasswordController,
} from "../controllers/usersController.js";

const router = Router();
/** User management is Admin (superAdmin) only. */
router.get("/", requireRoles("superAdmin"), requirePermission("users"), listUsersController);
router.post("/", requireRoles("superAdmin"), requirePermission("users"), createUserController);
router.patch("/:id", requireRoles("superAdmin"), requirePermission("users"), updateUserController);
router.post("/:id/reset-password", requireRoles("superAdmin"), requirePermission("users"), resetPasswordController);

export default router;

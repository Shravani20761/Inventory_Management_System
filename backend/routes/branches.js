import { Router } from "express";
import Branch from "../models/Branch.js";
import { requirePermission, requireRoles } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", requireRoles("superAdmin", "admin"), requirePermission("branches"), async (_req, res, next) => {
  try {
    const branches = await Branch.find().sort({ name: 1 }).lean();
    res.json(branches.map((b) => ({ ...b, id: b._id.toString() })));
  } catch (e) {
    next(e);
  }
});

router.post("/", requireRoles("superAdmin"), async (req, res, next) => {
  try {
    const b = await Branch.create(req.body);
    res.status(201).json(b.toJSON());
  } catch (e) {
    next(e);
  }
});

export default router;

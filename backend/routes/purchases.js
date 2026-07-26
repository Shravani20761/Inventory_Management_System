import { Router } from "express";
import Purchase from "../models/Purchase.js";
import mongoose from "mongoose";
import { purchaseToClient } from "../services/syncService.js";

const router = Router();

function branchFilter(req) {
  const isSuperAdmin = req.user?.role === "superAdmin";
  const branchId = req.user?.branchId;
  if (isSuperAdmin || !branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

router.get("/", async (req, res, next) => {
  try {
    const docs = await Purchase.find(branchFilter(req)).sort({ createdAt: -1 }).lean();
    res.json(docs.map((d) => purchaseToClient(d)));
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const bid = req.user?.branchId ? new mongoose.Types.ObjectId(req.user.branchId) : null;
    const record = await Purchase.create({
      branchId: bid,
      externalId: String(req.body.id ?? `PUR-${Date.now()}`),
      billDetails: req.body.billDetails ?? "",
      billNo: req.body.billNo ?? "",
      supplier: req.body.supplier ?? "",
      place: req.body.place ?? "",
      date: req.body.date ?? "",
      items: req.body.items ?? [],
      total: Number(req.body.total ?? 0),
    });
    res.status(201).json(purchaseToClient(record));
  } catch (e) {
    next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const bf = branchFilter(req);
    const doc = await Purchase.findOneAndUpdate(
      { externalId: req.params.id, ...bf },
      {
        $set: {
          billDetails: req.body.billDetails,
          billNo: req.body.billNo,
          supplier: req.body.supplier,
          place: req.body.place,
          date: req.body.date,
          items: req.body.items,
          total: req.body.total,
        },
      },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(purchaseToClient(doc));
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const bf = branchFilter(req);
    await Purchase.deleteOne({ externalId: req.params.id, ...bf });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

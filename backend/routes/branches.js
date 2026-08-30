import { Router } from "express";
import Branch from "../models/Branch.js";
import Invoice from "../models/Invoice.js";
import Quotation from "../models/Quotation.js";
import Purchase from "../models/Purchase.js";
import { requirePermission, requireRoles } from "../middleware/authMiddleware.js";
import { isHqRole } from "../constants/roles.js";
import { recordAudit } from "../services/auditService.js";
import { upsertBranchLogin, findBranchManager } from "../services/branchLoginService.js";

const router = Router();

function serialize(b, manager = null) {
  const o = b.toObject ? b.toObject() : b;
  return {
    ...o,
    id: o._id?.toString?.() || o.id,
    businessName: o.businessName || "BatteryMela",
    managerLogin: manager
      ? {
          id: manager._id?.toString?.() || manager.id,
          name: manager.name,
          email: manager.email,
          role: manager.role,
        }
      : null,
  };
}

async function withManager(branchDoc) {
  const lean = branchDoc.toObject ? branchDoc.toObject() : branchDoc;
  const manager = await findBranchManager(lean._id);
  return serialize(lean, manager);
}

/** List branches — HQ sees all; others see only assigned branch. */
router.get("/", async (req, res, next) => {
  try {
    if (isHqRole(req.user?.role)) {
      const branches = await Branch.find().sort({ name: 1 });
      const out = [];
      for (const b of branches) out.push(await withManager(b));
      return res.json(out);
    }
    const bid = req.user?.branchId;
    if (!bid) return res.json([]);
    const b = await Branch.findById(bid);
    return res.json(b ? [await withManager(b)] : []);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const b = await Branch.findById(req.params.id);
    if (!b) return res.status(404).json({ error: "Branch not found" });
    if (!isHqRole(req.user?.role) && String(b._id) !== String(req.user?.branchId)) {
      return res.status(403).json({ error: "Forbidden: branch access denied" });
    }
    res.json(await withManager(b));
  } catch (e) {
    next(e);
  }
});

function pickLoginFromBody(body = {}) {
  const loginEmail = body.loginEmail || body.managerEmail || body.credentials?.email || "";
  const loginPassword = body.loginPassword || body.managerPassword || body.credentials?.password || "";
  const explicitName = body.loginName || body.managerName || body.credentials?.name || "";
  const loginName = explicitName
    ? String(explicitName).trim()
    : body.name
      ? `${body.name} Manager`
      : "Branch Manager";
  const loginRole = body.loginRole || body.credentials?.role || "manager";
  return {
    loginEmail: String(loginEmail || "").trim(),
    loginPassword: String(loginPassword || ""),
    loginName,
    loginRole,
    hasLoginIntent: Boolean(String(loginEmail || "").trim() || String(loginPassword || "")),
  };
}

router.post("/", requireRoles("superAdmin"), requirePermission("branches"), async (req, res, next) => {
  try {
    const body = { ...req.body };
    const login = pickLoginFromBody(body);
    delete body.loginEmail;
    delete body.loginPassword;
    delete body.loginName;
    delete body.loginRole;
    delete body.managerEmail;
    delete body.managerPassword;
    delete body.credentials;

    if (!body.businessName) body.businessName = "BatteryMela";
    if (!body.status) body.status = "active";
    if (!body.branchName && body.name) body.branchName = body.name;
    if (login.loginName && !body.managerName) body.managerName = login.loginName;

    if (!login.loginEmail || !login.loginPassword) {
      return res.status(400).json({
        error: "Branch login email and password are required so the branch can sign in.",
      });
    }

    const b = await Branch.create(body);
    const manager = await upsertBranchLogin({
      branchId: b._id,
      name: login.loginName || `${b.name} Manager`,
      email: login.loginEmail,
      password: login.loginPassword,
      role: login.loginRole,
    });

    await recordAudit({
      userId: req.user?.sub,
      role: req.user?.role,
      branchId: b._id,
      action: "branch.create",
      entity: "Branch",
      entityId: b._id.toString(),
      metadata: {
        name: b.name,
        code: b.code,
        businessName: b.businessName,
        loginEmail: manager.email,
        loginRole: manager.role,
      },
    });

    res.status(201).json({
      ...(await withManager(b)),
      createdLogin: { email: manager.email, role: manager.role, name: manager.name },
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", requireRoles("superAdmin"), requirePermission("branches"), async (req, res, next) => {
  try {
    const b = await Branch.findById(req.params.id);
    if (!b) return res.status(404).json({ error: "Branch not found" });
    const login = pickLoginFromBody(req.body);
    const allowed = [
      "name",
      "branchName",
      "code",
      "branchId",
      "businessName",
      "address",
      "city",
      "phone",
      "email",
      "gstin",
      "managerName",
      "active",
      "status",
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) b[k] = req.body[k];
    }
    if (login.loginName && req.body.managerName === undefined) b.managerName = login.loginName;
    await b.save();

    let manager = null;
    if (login.loginEmail || login.loginPassword) {
      if (!login.loginEmail) {
        const existing = await findBranchManager(b._id);
        if (!existing?.email) {
          return res.status(400).json({ error: "Login email is required to set/update password" });
        }
        login.loginEmail = existing.email;
      }
      manager = await upsertBranchLogin({
        branchId: b._id,
        name: login.loginName || b.managerName || `${b.name} Manager`,
        email: login.loginEmail,
        password: login.loginPassword || undefined,
        role: login.loginRole,
      });
    }

    await recordAudit({
      userId: req.user?.sub,
      role: req.user?.role,
      branchId: b._id,
      action: "branch.update",
      entity: "Branch",
      entityId: b._id.toString(),
      metadata: {
        fields: Object.keys(req.body || {}),
        loginUpdated: Boolean(manager),
        loginEmail: manager?.email,
      },
    });
    res.json(await withManager(b));
  } catch (e) {
    next(e);
  }
});

/** Soft-deactivate — refuse hard delete when history exists. */
router.delete("/:id", requireRoles("superAdmin"), requirePermission("branches"), async (req, res, next) => {
  try {
    const b = await Branch.findById(req.params.id);
    if (!b) return res.status(404).json({ error: "Branch not found" });
    const bid = b._id;
    const [inv, qt, pur] = await Promise.all([
      Invoice.countDocuments({ branchId: bid }),
      Quotation.countDocuments({ branchId: bid }),
      Purchase.countDocuments({ branchId: bid }),
    ]);
    const hasHistory = inv + qt + pur > 0;
    if (hasHistory || req.query.hard !== "1") {
      b.status = "inactive";
      b.active = false;
      await b.save();
      // Deactivate branch logins so they cannot sign in
      const User = (await import("../models/User.js")).default;
      await User.updateMany(
        { branchId: bid, role: { $ne: "superAdmin" } },
        { $set: { active: false } },
      );
      await recordAudit({
        userId: req.user?.sub,
        role: req.user?.role,
        branchId: bid,
        action: "branch.deactivate",
        entity: "Branch",
        entityId: bid.toString(),
        metadata: { invoices: inv, quotations: qt, purchases: pur },
      });
      return res.json({
        deactivated: true,
        message: hasHistory
          ? "Branch has historical transactions — deactivated instead of deleted. Branch logins disabled."
          : "Branch deactivated. Branch logins disabled.",
        branch: await withManager(b),
      });
    }
    await Branch.deleteOne({ _id: bid });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

export default router;

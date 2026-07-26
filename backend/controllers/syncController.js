import { getSyncPayload, applySyncPayload } from "../services/syncService.js";

export async function getSyncAllController(req, res, next) {
  try {
    const branchId = req.user?.branchId || null;
    const isSuperAdmin = req.user?.role === "superAdmin";
    res.json(await getSyncPayload({ branchId, isSuperAdmin }));
  } catch (err) {
    next(err);
  }
}

export async function putSyncAllController(req, res, next) {
  try {
    let branchId = req.user?.branchId || null;
    const isSuperAdmin = req.user?.role === "superAdmin";
    const body = { ...req.body };
    if (isSuperAdmin && !body.branchId && branchId) {
      body.branchId = branchId;
    }
    const data = await applySyncPayload(body, { branchId, isSuperAdmin });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

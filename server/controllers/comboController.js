import { recommendCombo } from "../services/comboService.js";

export async function recommendComboController(req, res, next) {
  try {
    res.json(await recommendCombo(req.body, { branchId: req.user?.branchId, isSuperAdmin: req.user?.role === "superAdmin" }));
  } catch (err) {
    next(err);
  }
}

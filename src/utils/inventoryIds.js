/**
 * Max numeric `id` in inventory rows (ignores Mongo ObjectId strings so Math.max never becomes NaN).
 */
export function maxNumericInventoryId(inventory) {
  return (inventory || []).reduce((m, row) => {
    const n = Number(row?.id);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
}

export function nextNumericInventoryId(inventory) {
  return maxNumericInventoryId(inventory) + 1;
}

/** True for a 24-char hex MongoDB ObjectId string. */
export function isMongoObjectId(value) {
  if (value == null || value === "") return false;
  return /^[a-f\d]{24}$/i.test(String(value).trim());
}

/**
 * Resolve id for PUT /inventory/:id — prefer Mongo `_id`, then legacy numeric id.
 * @param {object} item — saved row payload
 * @param {string|null|undefined} editingMongoId — `_id` captured when Edit was clicked
 */
export function resolveInventoryUpdateId(item, editingMongoId) {
  const candidates = [editingMongoId, item?._id, item?.id, item?.legacyId];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const s = String(c).trim();
    if (isMongoObjectId(s)) return s;
  }
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return String(n);
  }
  return null;
}

/** Prefer UI `id`, then `legacyId`, then string `_id` (Mongo). */
export function effectiveInventoryId(row) {
  if (!row) return undefined;
  const a = row.id;
  if (a != null && a !== "") return a;
  const b = row.legacyId;
  if (b != null && b !== "") return b;
  const c = row._id;
  if (c != null && c !== "") return c;
  return undefined;
}

export function inventoryModelKey(row) {
  return String(row?.model ?? row?.modelName ?? "")
    .trim()
    .toLowerCase();
}

/** Stable id for matching rows (avoids `undefined`/`NaN` id bugs and number vs string "12"). */
export function inventoryRowIdKey(row) {
  const id = effectiveInventoryId(row);
  if (id == null || id === "") {
    const m = inventoryModelKey(row);
    return m ? `m:${m}` : "";
  }
  if (typeof id === "number") {
    return Number.isFinite(id) ? `n:${id}` : "";
  }
  const s = String(id).trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return `n:${Number(s)}`;
  return `s:${s}`;
}

/**
 * Same inventory row (for delete / edit). Uses id/legacyId/_id when present; else model/modelName.
 */
export function inventoryRowsMatch(a, b) {
  if (!a || !b) return false;
  const aOid = a._id != null && String(a._id).trim() !== "" ? String(a._id) : "";
  const bOid = b._id != null && String(b._id).trim() !== "" ? String(b._id) : "";
  if (aOid && bOid) return aOid === bOid;
  const ka = inventoryRowIdKey(a);
  const kb = inventoryRowIdKey(b);
  if (ka && kb && ka === kb) return true;
  if (ka && kb && ka !== kb) return false;
  const ca = String(a?.comboId ?? "").trim().toLowerCase();
  const cb = String(b?.comboId ?? "").trim().toLowerCase();
  if (ca && cb && ca === cb) return true;
  const ma = inventoryModelKey(a);
  const mb = inventoryModelKey(b);
  /** Without ids, model alone is not unique (same SKU on Car vs Bike, or duplicate rows). */
  if (ma && ma === mb && !ka && !kb) {
    const ta = String(a?.type ?? "").trim().toLowerCase();
    const tb = String(b?.type ?? "").trim().toLowerCase();
    const bra = String(a?.brand ?? "").trim().toLowerCase();
    const brb = String(b?.brand ?? "").trim().toLowerCase();
    return ta === tb && bra === brb;
  }
  return false;
}

/**
 * Find row index in full inventory for a row object (from table / modal).
 * Tries id match, reference, legacyId/_id, then unique model name.
 */
export function findInventoryRowIndex(inv, clicked) {
  if (!Array.isArray(inv) || !clicked) return -1;
  /** Same array element as in `filtered` — must win over loose model-only matches. */
  let idx = inv.findIndex((i) => i === clicked);
  if (idx !== -1) return idx;
  idx = inv.findIndex((i) => inventoryRowsMatch(i, clicked));
  if (idx !== -1) return idx;
  const cid = effectiveInventoryId(clicked);
  if (cid != null && cid !== "") {
    const idHits = inv
      .map((row, j) => (String(effectiveInventoryId(row) ?? "") === String(cid) ? j : -1))
      .filter((j) => j >= 0);
    if (idHits.length === 1) return idHits[0];
  }
  const combo = String(clicked?.comboId ?? "").trim().toLowerCase();
  if (combo) {
    const comboHits = inv
      .map((row, j) => (String(row?.comboId ?? "").trim().toLowerCase() === combo ? j : -1))
      .filter((j) => j >= 0);
    if (comboHits.length === 1) return comboHits[0];
  }
  const m = inventoryModelKey(clicked);
  if (m) {
    const hits = inv
      .map((row, j) => (inventoryModelKey(row) === m ? j : -1))
      .filter((j) => j >= 0);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const t = String(clicked?.type ?? "").trim().toLowerCase();
      const br = String(clicked?.brand ?? "").trim().toLowerCase();
      const narrowed = hits.filter((j) => {
        const row = inv[j];
        return (
          String(row?.type ?? "").trim().toLowerCase() === t && String(row?.brand ?? "").trim().toLowerCase() === br
        );
      });
      if (narrowed.length === 1) return narrowed[0];
    }
  }
  return -1;
}

/** Remove one inventory row; falls back to unique `effectiveInventoryId` if ref match fails (API rows). */
export function removeInventoryRow(inv, clicked) {
  if (!Array.isArray(inv) || !clicked) return inv;
  const idx = findInventoryRowIndex(inv, clicked);
  if (idx !== -1) return inv.filter((_, j) => j !== idx);
  const id = effectiveInventoryId(clicked);
  if (id != null && id !== "") {
    const idStr = String(id);
    const filtered = inv.filter((row) => String(effectiveInventoryId(row) ?? "") !== idStr);
    if (filtered.length < inv.length) return filtered;
  }
  return inv;
}

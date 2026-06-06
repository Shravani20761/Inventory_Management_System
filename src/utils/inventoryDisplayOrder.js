/**
 * SR.NO is display-only (not stored in MongoDB).
 * Sort rows consistently, then derive serial numbers from rendered table index.
 */

export function sortInventoryForDisplay(rows) {
  return [...(rows || [])].sort((a, b) => {
    const la = Number(a.legacyId);
    const lb = Number(b.legacyId);
    if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;

    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;

    return String(a._id ?? a.id ?? "").localeCompare(String(b._id ?? b.id ?? ""));
  });
}

/** @param {number} index — 0-based index in the currently rendered (filtered) list */
export function inventoryDisplaySerial(index, { page = 1, pageSize = null } = {}) {
  const base =
    pageSize != null && Number(pageSize) > 0 ? (Math.max(1, Number(page)) - 1) * Number(pageSize) : 0;
  return base + index + 1;
}

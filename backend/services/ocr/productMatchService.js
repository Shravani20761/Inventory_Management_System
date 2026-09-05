import { listAllCategoriesAsLegacyProducts } from "../categoryInventoryService.js";

function norm(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function tokens(v) {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function fuzzyScore(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 88;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return Math.round((200 * hit) / (ta.size + tb.size));
}

function catalogKeys(row) {
  return {
    id: String(row._id ?? row.id ?? ""),
    sku: row.comboId || row.sku || row.model || row.modelNumber || row.batteryModel || "",
    model: row.model || row.modelNumber || row.batteryModel || row.inverterModel || "",
    brand: row.brand || "",
    name: [row.brand, row.model || row.batteryModel || row.inverterModel, row.comboId].filter(Boolean).join(" "),
    type: row.type || row.category || "",
    quantity: Number(row.quantity ?? 0),
  };
}

function labelOf(row) {
  return `${row.brand} ${row.model}`.trim() || row.sku;
}

/**
 * Match priority: SKU → model/code → brand+model → exact name → normalized name → fuzzy suggestion.
 * Never auto-creates products. Fuzzy matches are suggestions only.
 */
export async function matchBillItemsToInventory(items, { branchId = null, isSuperAdmin = false } = {}) {
  const catalog = await listAllCategoriesAsLegacyProducts({
    branchId,
    isSuperAdmin,
    includeProfit: false,
    strictBranch: Boolean(branchId) && !isSuperAdmin,
  });
  const rows = (catalog || []).map(catalogKeys);

  return (items || []).map((item) => {
    const sku = item.sku || item.modelNumber || "";
    const name = item.productName || item.description || "";
    const brand = item.brand || "";
    const ranked = [];

    const consider = (row, score, why) => {
      if (!row?.id || score < 55) return;
      const existing = ranked.find((r) => r.id === row.id);
      if (existing) {
        if (score > existing.score) {
          existing.score = score;
          existing.method = why;
        }
        return;
      }
      ranked.push({ id: row.id, label: labelOf(row), score, method: why, quantity: row.quantity, brand: row.brand, model: row.model });
    };

    for (const row of rows) {
      if (sku && norm(sku) && (norm(sku) === norm(row.sku) || norm(sku) === norm(row.model))) {
        consider(row, 100, "sku");
      }
      if (sku && norm(sku) && norm(sku) === norm(row.model)) consider(row, 98, "model");
      if (brand && row.brand && norm(brand) === norm(row.brand) && fuzzyScore(sku || name, row.model) >= 90) {
        consider(row, 94, "brand+model");
      }
      if (name && norm(name) === norm(row.name)) consider(row, 92, "exact-name");
      if (name && norm(name) === norm(row.model)) consider(row, 90, "normalized-name");
      consider(row, fuzzyScore(sku, row.model), "fuzzy");
      consider(row, fuzzyScore(name, row.name), "fuzzy");
      consider(row, fuzzyScore(name, row.model), "fuzzy");
    }

    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const auto = best && best.score >= 90 && best.method !== "fuzzy";
    const suggestions = ranked.slice(0, 5).map((r) => ({
      id: r.id,
      label: r.label,
      score: r.score,
      method: r.method,
    }));

    if (auto) {
      return {
        ...item,
        productId: best.id,
        matchStatus: "matched",
        matchedLabel: best.label,
        matchScore: best.score,
        matchMethod: best.method,
        currentStock: best.quantity,
        suggestedMatches: suggestions,
        needsReview: false,
        createNewProduct: false,
      };
    }

    return {
      ...item,
      productId: "",
      matchStatus: "unmatched",
      matchedLabel: best ? `Possible match: ${best.label}` : "",
      matchScore: best?.score || 0,
      matchMethod: best?.method || "none",
      currentStock: null,
      suggestedMatches: suggestions,
      needsReview: true,
      createNewProduct: false,
    };
  });
}

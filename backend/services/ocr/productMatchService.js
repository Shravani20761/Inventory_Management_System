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

/**
 * Match priority: SKU → model/code → brand+model → exact name → normalized name → fuzzy.
 * Never auto-creates products.
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
    let best = null;
    let bestScore = 0;
    let method = "none";

    const trySet = (row, score, why) => {
      if (score > bestScore) {
        best = row;
        bestScore = score;
        method = why;
      }
    };

    for (const row of rows) {
      if (sku && norm(sku) && (norm(sku) === norm(row.sku) || norm(sku) === norm(row.model))) {
        trySet(row, 100, "sku");
        if (bestScore === 100) break;
      }
    }
    if (bestScore < 100) {
      for (const row of rows) {
        if (sku && norm(sku) && norm(sku) === norm(row.model)) trySet(row, 98, "model");
        if (brand && row.brand && norm(brand) === norm(row.brand) && fuzzyScore(sku || name, row.model) >= 90) {
          trySet(row, 94, "brand+model");
        }
        if (name && norm(name) === norm(row.name)) trySet(row, 92, "exact-name");
        if (name && norm(name) === norm(row.model)) trySet(row, 90, "normalized-name");
        trySet(row, fuzzyScore(sku, row.model), "fuzzy");
        trySet(row, fuzzyScore(name, row.name), "fuzzy");
        trySet(row, fuzzyScore(name, row.model), "fuzzy");
        if (brand && norm(brand) === norm(row.brand)) trySet(row, fuzzyScore(name, row.model), "fuzzy");
      }
    }

    if (best && bestScore >= 78) {
      return {
        ...item,
        productId: best.id,
        matchStatus: "matched",
        matchedLabel: `${best.brand} ${best.model}`.trim() || best.sku,
        matchScore: bestScore,
        matchMethod: method,
        currentStock: best.quantity,
      };
    }
    return {
      ...item,
      productId: "",
      matchStatus: "new",
      matchedLabel: "",
      matchScore: bestScore,
      matchMethod: method,
      currentStock: null,
      createNewProduct: false,
    };
  });
}

import PurchaseBill from "../../models/PurchaseBill.js";
import PurchaseOrder from "../../models/PurchaseOrder.js";

function fold(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/\b(PRIVATE|PVT\.?|LTD\.?|LIMITED|INDUSTRIES|INDUSTRY|LLC|LLP|CO\.?|COMPANY|BATTERIES|BATTERY)\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreNames(a, b) {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 100;
  if (fa.includes(fb) || fb.includes(fa)) return 88;
  const ta = new Set(fa.split(" "));
  const tb = new Set(fb.split(" "));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return Math.round((200 * hit) / (ta.size + tb.size));
}

/**
 * Suggest a supplier from previous bills / purchase orders.
 * Never hardcodes a company as the default.
 */
export async function matchSupplier(details = {}, tenant = {}) {
  const gstin = String(details.gstin || "").trim().toUpperCase();
  const name = String(details.name || details.legalName || "").trim();
  const q = {};
  if (tenant.branchId) q.branchId = tenant.branchId;

  const [bills, orders] = await Promise.all([
    PurchaseBill.find(gstin ? { ...q, "supplierDetails.gstin": gstin } : q)
      .select("supplierDetails invoiceNumber")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
    PurchaseOrder.find(gstin ? { ...q, vendorGst: gstin } : q)
      .select("vendorName vendorGst vendorMobile")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
  ]);

  const candidates = [];
  for (const b of bills) {
    candidates.push({
      name: b.supplierDetails?.name || "",
      gstin: b.supplierDetails?.gstin || "",
      phone: b.supplierDetails?.phone || "",
      source: "purchase_bill",
    });
  }
  for (const o of orders) {
    candidates.push({
      name: o.vendorName || "",
      gstin: o.vendorGst || "",
      phone: o.vendorMobile || "",
      source: "purchase_order",
    });
  }

  let best = null;
  let bestScore = 0;
  let method = "none";
  for (const c of candidates) {
    if (gstin && c.gstin && gstin === String(c.gstin).toUpperCase()) {
      best = c;
      bestScore = 100;
      method = "gstin";
      break;
    }
    const s = scoreNames(name, c.name);
    if (s > bestScore) {
      best = c;
      bestScore = s;
      method = "name";
    }
  }

  if (best && bestScore >= 86) {
    return {
      matched: true,
      confidence: bestScore,
      method,
      name: best.name,
      gstin: best.gstin || gstin,
      phone: best.phone || details.phone || "",
      needsReview: bestScore < 95,
    };
  }
  return {
    matched: false,
    confidence: bestScore,
    method,
    name: name || "",
    gstin,
    phone: details.phone || "",
    needsReview: true,
    suggestedName: bestScore >= 70 ? best?.name : "",
  };
}

/**
 * Pure vehicle-fitment vs inventory matching. No invented compatibility.
 * Only scores fields that exist on BOTH the fitment group and the product.
 */

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function norm(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function typesCompatible(fitmentType, productType, productBatteryType) {
  const f = norm(fitmentType);
  if (!f) return { applicable: false, ok: true };
  const blob = `${norm(productBatteryType)} ${norm(productType)}`;
  const aliases = {
    automotive: ["automotive", "car", "truck", "commercial", "four-wheeler"],
    car: ["car", "automotive", "truck", "commercial"],
    "two-wheeler": ["two-wheeler", "bike", "scooter", "motorcycle"],
    bike: ["bike", "two-wheeler", "motorcycle", "scooter"],
    scooter: ["scooter", "two-wheeler", "bike"],
  };
  const keys = aliases[f] || [f];
  const ok = keys.some((k) => blob.includes(k)) || blob.includes(f);
  return { applicable: true, ok };
}

function dimOk(fitmentMm, productMm) {
  const f = num(fitmentMm);
  const p = num(productMm);
  if (f == null || p == null) return { applicable: false, ok: true };
  return { applicable: true, ok: p <= f + 8 };
}

/**
 * @returns {{ compatible: boolean, rank: string, score: number, maxScore: number, checks: object, reasons: string[] }}
 */
export function scoreProductAgainstFitment(product, fitment, { includeOutOfStock = false } = {}) {
  const checks = {};
  const reasons = [];
  let score = 0;
  let maxScore = 0;
  let mandatoryFail = false;

  const pAh = num(product.ah ?? product.capacityAh ?? product.capacity);
  const pVolt = num(product.voltage);
  const qty = Number(product.quantity ?? product.qty ?? 0) || 0;

  const fVolt = num(fitment.voltage);
  if (fVolt != null) {
    maxScore += 25;
    if (pVolt == null) {
      mandatoryFail = true;
      checks.voltage = { status: "unknown", label: "Voltage not on product record" };
    } else if (pVolt === fVolt) {
      score += 25;
      checks.voltage = { status: "pass", label: "Voltage compatible" };
      reasons.push("Voltage compatible");
    } else {
      mandatoryFail = true;
      checks.voltage = { status: "fail", label: `Voltage mismatch (${pVolt}V vs ${fVolt}V)` };
    }
  }

  const minAh = num(fitment.minAh);
  const maxAh = num(fitment.maxAh);
  if (minAh != null || maxAh != null) {
    maxScore += 25;
    const lo = minAh ?? 0;
    const hi = maxAh ?? 9999;
    if (pAh == null) {
      mandatoryFail = true;
      checks.capacity = { status: "unknown", label: "Capacity (Ah) not on product record" };
    } else if (pAh >= lo && pAh <= hi) {
      score += 25;
      checks.capacity = { status: "pass", label: "Capacity compatible" };
      reasons.push("Capacity compatible");
    } else {
      mandatoryFail = true;
      checks.capacity = { status: "fail", label: `Capacity ${pAh}Ah outside ${lo}–${hi} Ah` };
    }
  }

  if (String(fitment.batteryType || "").trim()) {
    maxScore += 15;
    const t = typesCompatible(fitment.batteryType, product.type, product.batteryType);
    if (!t.ok) {
      mandatoryFail = true;
      checks.batteryType = { status: "fail", label: "Battery type mismatch" };
    } else {
      score += 15;
      checks.batteryType = { status: "pass", label: "Battery type compatible" };
      reasons.push("Battery type compatible");
    }
  }

  const hasFitmentDims = num(fitment.length) != null || num(fitment.width) != null || num(fitment.height) != null;
  if (hasFitmentDims) {
    const l = dimOk(fitment.length, product.length ?? product.lengthMm);
    const w = dimOk(fitment.width, product.width ?? product.widthMm);
    const h = dimOk(fitment.height, product.height ?? product.heightMm);
    const anyProductDim =
      num(product.length ?? product.lengthMm) != null ||
      num(product.width ?? product.widthMm) != null ||
      num(product.height ?? product.heightMm) != null;
    if (anyProductDim) {
      maxScore += 15;
      if (l.ok && w.ok && h.ok) {
        score += 15;
        checks.dimensions = { status: "pass", label: "Dimensions compatible" };
        reasons.push("Dimensions compatible");
      } else {
        mandatoryFail = true;
        checks.dimensions = { status: "fail", label: "Dimensions exceed fitment envelope" };
      }
    } else {
      checks.dimensions = { status: "unknown", label: "Product dimensions not recorded" };
    }
  }

  const fTerm = norm(fitment.terminalConfiguration);
  const pTerm = norm(product.terminalConfiguration);
  if (fTerm) {
    if (pTerm) {
      maxScore += 10;
      if (pTerm === fTerm || pTerm.includes(fTerm) || fTerm.includes(pTerm)) {
        score += 10;
        checks.terminal = { status: "pass", label: "Terminal configuration compatible" };
        reasons.push("Terminal configuration compatible");
      } else {
        mandatoryFail = true;
        checks.terminal = { status: "fail", label: "Terminal configuration mismatch" };
      }
    } else {
      checks.terminal = { status: "unknown", label: "Terminal configuration not on product record" };
    }
  }

  const fPol = norm(fitment.polarity);
  const pPol = norm(product.polarity);
  if (fPol) {
    if (pPol) {
      maxScore += 10;
      if (pPol === fPol || pPol.includes(fPol) || fPol.includes(pPol)) {
        score += 10;
        checks.polarity = { status: "pass", label: "Polarity compatible" };
        reasons.push("Polarity compatible");
      } else {
        mandatoryFail = true;
        checks.polarity = { status: "fail", label: "Polarity mismatch" };
      }
    } else {
      checks.polarity = { status: "unknown", label: "Polarity not on product record" };
    }
  }

  const inStock = qty > 0;
  checks.stock = inStock
    ? { status: "pass", label: "Currently in stock" }
    : { status: "fail", label: "Out of stock" };
  if (inStock) reasons.push("Currently in stock");
  if (!includeOutOfStock && !inStock) mandatoryFail = true;

  const unknownOptional = Object.values(checks).some((c) => c.status === "unknown");
  let rank = "alternative";
  if (!mandatoryFail) {
    if (!unknownOptional && maxScore > 0 && score === maxScore && inStock) rank = "exact";
    else if (unknownOptional) rank = "good";
    else rank = "alternative";
  }

  return {
    compatible: !mandatoryFail,
    rank,
    score,
    maxScore,
    checks,
    reasons,
    inStock,
  };
}

export function rankLabel(rank) {
  if (rank === "exact") return "Best Match";
  if (rank === "good") return "Good Match";
  return "Alternative";
}

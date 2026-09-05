/**
 * Split an invoice into supplier / buyer / manufacturer sections and extract parties
 * from those bounded blocks only. Never concatenates keywords across regions.
 */
import { GSTIN_RE, FOOTER_RE } from "./billColumns.js";
import { clusterRows } from "./tableStructure.js";

export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
export const PHONE_BLOCK_RE =
  /(?:ph(?:one)?|mobile|tel|contact)\s*[:.]?\s*([+0-9][0-9\s/.,()+-]{7,48})/i;

const LABEL_SPECS = [
  { kind: "supplier", re: /(?:sold\s*by|bill\s*from|supplier(?:\s*name)?|seller(?:\s*name)?)\s*:?/i },
  { kind: "buyer", re: /bill\s*to(?:\s*party)?|buyer(?:\s*name)?|customer(?:\s*name)?|purchaser\s*:?/i },
  { kind: "ship", re: /(?:ship\s*to|consignee|deliver\s*to)\s*:?/i },
  { kind: "manufacturer", re: /authoris[e]?d\s*distributors?\s*for|authoriz[e]?d\s*distributors?\s*for|authoris[e]?d\s*dealer|manufacturer(?:\s*name)?|brand(?:\s*name)?\s*:?/i },
  { kind: "table", re: /^(?:description(?:\s+of\s+goods)?|particulars|hsn\/sac)\b/i },
  { kind: "tax", re: /^(?:taxable\s+value|grand\s*total|sub\s*total|invoice\s*total)\b/i },
];

const TITLE_SKIP =
  /^(?:gst\s*invoice|tax\s*invoice|invoice|bill\s*of\s*supply|original\s*for\s*recipient|duplicate|irn|ack\s*no)\b/i;
const META_SKIP =
  /^(?:invoice\s*(?:no|number|#)|date|dated|place\s*of\s*supply|reverse\s*charge|vehicle|e-?way|payment\s*terms|po\s*(?:no|date)|phone|email|gstin|pan|state)\b/i;

function cleanSpace(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function kindFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (FOOTER_RE.test(t) || /^(?:cgst|sgst|igst|cess)\b/i.test(t)) return "tax";
  for (const spec of LABEL_SPECS) {
    if (spec.re.test(t)) return spec.kind;
  }
  return null;
}

function stripLeadingLabel(text) {
  return String(text || "")
    .replace(
      /^(?:sold\s*by|bill\s*from|supplier(?:\s*name)?|seller(?:\s*name)?|bill\s*to(?:\s*party)?|buyer(?:\s*name)?|customer(?:\s*name)?|purchaser|ship\s*to|consignee|deliver\s*to|authoris[e]?d\s*distributors?\s*for|authoriz[e]?d\s*distributors?\s*for|manufacturer(?:\s*name)?|brand(?:\s*name)?)\s*:?\s*/i,
      "",
    )
    .trim();
}

/** Split one OCR line that contains two region labels (e.g. Bill To + Authorised Distributors). */
export function splitLineBySectionLabels(text) {
  const src = String(text || "");
  if (!src.trim()) return [];
  const hits = [];
  const finders = [
    { kind: "buyer", re: /bill\s*to(?:\s*party)?\s*:?/gi },
    { kind: "ship", re: /(?:ship\s*to|consignee|deliver\s*to)\s*:?/gi },
    { kind: "manufacturer", re: /authoris[e]?d\s*distributors?\s*for\s*:?|authoriz[e]?d\s*distributors?\s*for\s*:?/gi },
    { kind: "supplier", re: /(?:sold\s*by|bill\s*from|supplier(?:\s*name)?|seller(?:\s*name)?)\s*:?/gi },
  ];
  for (const f of finders) {
    f.re.lastIndex = 0;
    let m;
    while ((m = f.re.exec(src))) {
      hits.push({ kind: f.kind, index: m.index, end: m.index + m[0].length, label: m[0] });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  if (!hits.length) return [{ kind: null, text: src.trim() }];
  const parts = [];
  if (hits[0].index > 0) {
    const before = src.slice(0, hits[0].index).trim();
    if (before) parts.push({ kind: null, text: before });
  }
  for (let i = 0; i < hits.length; i += 1) {
    const stop = i + 1 < hits.length ? hits[i + 1].index : src.length;
    const body = src.slice(hits[i].end, stop).trim();
    parts.push({ kind: hits[i].kind, text: body, label: hits[i].label });
  }
  return parts.filter((p) => p.text || p.kind);
}

function isAddressLine(text) {
  const t = String(text || "").trim();
  if (t.length < 8) return false;
  if (GSTIN_RE.test(t) && t.replace(GSTIN_RE, "").trim().length < 8) return false;
  return (
    /\d/.test(t) &&
    /(road|rd\b|street|st\b|nagar|marg|pune|mumbai|delhi|india|state|pin| Dist|taluka|sr\s*no|survey|plot|area|chowk|peth)/i.test(
      t,
    )
  );
}

export function looksLikeCompanyName(text) {
  const t = stripLeadingLabel(cleanSpace(text));
  if (t.length < 6 || t.length > 90) return false;
  if (TITLE_SKIP.test(t) || META_SKIP.test(t)) return false;
  if (kindFromText(t) === "manufacturer" && t.length < 48) return false;
  if (/authoris[e]?d\s*distributors?/i.test(t) && /for\b/i.test(t)) return false;
  if (!/[A-Za-z]{3}/.test(t)) return false;
  if (GSTIN_RE.test(t) && t.length <= 18) return false;
  if (EMAIL_RE.test(t)) return false;
  if (PHONE_BLOCK_RE.test(t) && t.length < 28) return false;
  if (isAddressLine(t) && !/\b(pvt|ltd|limited|llp|llc|inc)\b/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (/\b(pvt\.?|ltd\.?|limited|llp|llc|inc|industries|solutions|enterprises|traders|agency|automobiles|motors|services)\b/i.test(t)) {
    return true;
  }
  const alpha = words.filter((w) => /[A-Za-z]{2,}/.test(w));
  return alpha.length >= 2;
}

function companyNameFromLines(lines, kind = "") {
  for (const raw of lines) {
    const t = stripLeadingLabel(cleanSpace(raw));
    if (!t) continue;
    if (looksLikeCompanyName(t)) return t;
    if (
      (kind === "buyer" || kind === "supplier") &&
      t.length >= 6 &&
      t.length <= 90 &&
      /[A-Za-z]{4}/.test(t) &&
      !TITLE_SKIP.test(t) &&
      !META_SKIP.test(t) &&
      !isAddressLine(t) &&
      !GSTIN_RE.test(t) &&
      !EMAIL_RE.test(t)
    ) {
      return t;
    }
  }
  return "";
}

function phonesFromText(text) {
  const m = String(text || "").match(PHONE_BLOCK_RE);
  if (!m?.[1]) return "";
  const chunk = m[1].replace(/\s+/g, " ").trim();
  if (GSTIN_RE.test(chunk)) return "";
  return chunk.replace(/[.,;]+$/, "").trim();
}

function metaFromText(text) {
  const blob = String(text || "");
  const gstin = (blob.match(GSTIN_RE)?.[1] || "").toUpperCase();
  const email = (blob.match(EMAIL_RE) || [])[0] || "";
  const pan = (blob.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/) || [])[1] || "";
  const address = blob
    .split(/\n/)
    .map((l) => cleanSpace(l))
    .filter((l) => isAddressLine(l))
    .join(", ");
  return {
    gstin,
    email,
    phone: phonesFromText(blob),
    pan,
    address,
    stateCode: gstin ? gstin.slice(0, 2) : "",
  };
}

function splitRowByGutter(row) {
  const words = [...(row.words || [])].sort((a, b) => a.x - b.x);
  if (words.length < 4) return [row];
  let bestGap = 0;
  let bestI = -1;
  for (let i = 1; i < words.length; i += 1) {
    const gap = words[i].x - (words[i - 1].x + (words[i - 1].width || 0));
    if (gap > bestGap) {
      bestGap = gap;
      bestI = i;
    }
  }
  if (bestGap < 70 || bestI < 1) return [row];
  const left = words.slice(0, bestI);
  const right = words.slice(bestI);
  const asRow = (ws, col) => ({
    ...row,
    words: ws,
    text: ws.map((w) => w.text).join(" "),
    x: ws.reduce((s, w) => s + w.cx, 0) / ws.length,
    column: col,
  });
  return [asRow(left, "left"), asRow(right, "right")];
}

function fragmentsFromRow(row) {
  const splitRows = splitRowByGutter(row);
  const out = [];
  for (const r of splitRows) {
    const parts = splitLineBySectionLabels(r.text);
    if (parts.length === 1 && !parts[0].kind) {
      out.push({
        kind: null,
        text: r.text,
        y: r.cy ?? r.y ?? 0,
        x: r.x ?? r.words?.[0]?.x ?? 0,
        column: r.column || null,
        page: r.page || 1,
      });
      continue;
    }
    for (const p of parts) {
      out.push({
        kind: p.kind,
        text: p.text || p.label || "",
        label: p.label || "",
        y: r.cy ?? r.y ?? 0,
        x: r.x ?? r.words?.[0]?.x ?? 0,
        column: r.column || null,
        page: r.page || 1,
      });
    }
  }
  return out;
}

function rowsFromInput(lines, words) {
  if (Array.isArray(words) && words.length) {
    const pages = [...new Set(words.map((w) => w.page || 1))].sort((a, b) => a - b);
    const rows = [];
    for (const page of pages) rows.push(...clusterRows(words, page));
    if (rows.length) return rows;
  }
  return (lines || []).map((text, i) => ({
    text: String(text || "").trim(),
    y: i * 22,
    cy: i * 22 + 8,
    x: 0,
    page: 1,
    words: [],
  }));
}

function isGstinOnlyLine(text) {
  const t = cleanSpace(text).replace(/^gstin\s*(?:no|number|#)?\s*:?\s*/i, "");
  if (!t) return false;
  return GSTIN_RE.test(t) && t.replace(GSTIN_RE, "").replace(/[:\s-]/g, "").length < 6;
}

function sectionBlob(sec) {
  if (!sec) return "";
  return (sec.lines || [])
    .map((l) => (typeof l === "string" ? l : l.text))
    .join("\n");
}

function attachGstinLine(sections, current, frag) {
  const trySec = (sec) => {
    if (!sec) return false;
    if (GSTIN_RE.test(sectionBlob(sec))) return false;
    if (sec === current) {
      current.lines.push({ text: frag.text, y: frag.y });
      return true;
    }
    sec.lines.push(frag.text);
    sec.text = sec.lines.join("\n");
    return true;
  };
  if (current.kind === "buyer" || current.kind === "supplier" || current.kind === "header") {
    return trySec(current);
  }
  for (const k of ["buyer", "supplier", "header"]) {
    const prev = [...sections].reverse().find((s) => s.kind === k);
    if (trySec(prev)) return true;
  }
  return false;
}

function buildSections(fragments) {
  const xs = fragments.map((f) => Number(f.x) || 0).filter((n) => n > 0);
  const mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const colOf = (f) => {
    if (f.column === "left" || f.column === "right") return f.column;
    if (mid && Number(f.x) > mid + 40) return "right";
    return "left";
  };

  const currents = {
    left: { kind: "header", lines: [], y: 0, page: 1, column: "left" },
    right: null,
  };
  const sections = [];

  const pushSlot = (slot) => {
    if (!slot) return;
    const text = slot.lines.map((l) => l.text).filter(Boolean).join("\n");
    if (!text.trim() && slot.kind === "other") return;
    if (!text.trim() && slot.kind === "header" && slot.column === "right") return;
    sections.push({
      kind: slot.kind,
      text,
      lines: slot.lines.map((l) => l.text),
      y: slot.y,
      page: slot.page,
      column: slot.column,
    });
  };

  const startSlot = (col, kind, frag, lineText) => {
    currents[col] = {
      kind,
      lines: lineText ? [{ text: lineText, y: frag.y }] : [],
      y: frag.y,
      page: frag.page,
      column: col,
    };
  };

  for (const frag of fragments) {
    const col = colOf(frag);
    if (!currents[col]) startSlot(col, frag.kind || "other", frag, "");
    const labeled = frag.kind;
    const rest = stripLeadingLabel(frag.text);
    const inferred = kindFromText(frag.text);
    const nextKind = labeled || (inferred && inferred !== "supplier" ? inferred : null);

    if (nextKind && nextKind !== currents[col].kind) {
      pushSlot(currents[col]);
      startSlot(col, nextKind, frag, rest);
      continue;
    }

    if (isGstinOnlyLine(frag.text) && attachGstinLine(sections, currents[col], frag)) {
      continue;
    }
    if (frag.text) currents[col].lines.push({ text: frag.text, y: frag.y });
  }
  pushSlot(currents.left);
  pushSlot(currents.right);
  return sections.filter((s) => s.text.trim() || s.kind === "buyer" || s.kind === "supplier");
}

function scoreSupplierSection(section, index) {
  const kind = section.kind;
  const meta = metaFromText(section.text);
  const name = companyNameFromLines(section.lines, kind);
  let score = 0;
  if (kind === "supplier") score += 95;
  if (kind === "header") score += index === 0 ? 88 : 55;
  if (kind === "buyer") score -= 140;
  if (kind === "ship") score -= 100;
  if (kind === "manufacturer") score -= 130;
  if (kind === "table" || kind === "tax" || kind === "footer") score -= 120;
  if (meta.gstin) score += 22;
  if (meta.phone) score += 10;
  if (meta.email) score += 10;
  if (name) score += 8;
  return { score, name, meta };
}

function emptyParty() {
  return {
    name: "",
    legalName: "",
    address: "",
    billingAddress: "",
    shippingAddress: "",
    phone: "",
    email: "",
    gstin: "",
    pan: "",
    state: "",
    stateCode: "",
  };
}

function partyFromSection(section, nameOverride) {
  const meta = metaFromText(section?.text || "");
  const name = nameOverride || companyNameFromLines(section?.lines || [], section?.kind || "");
  return {
    ...emptyParty(),
    name,
    legalName: name,
    address: meta.address,
    billingAddress: meta.address,
    phone: meta.phone,
    email: meta.email,
    gstin: meta.gstin,
    pan: meta.pan,
    stateCode: meta.stateCode,
  };
}

/**
 * @param {{ blob?: string, lines?: string[], words?: object[] }} input
 */
export function extractParties(input = {}) {
  const blob = String(input.blob || input.text || "");
  const lines = Array.isArray(input.lines) && input.lines.length ? input.lines : blob.split(/\n/).map((l) => l.trim());
  const rows = rowsFromInput(lines, input.words);
  const fragments = [];
  for (const row of rows) {
    if (!String(row.text || "").trim()) continue;
    fragments.push(...fragmentsFromRow(row));
  }
  const sections = buildSections(fragments);

  const scored = sections.map((section, index) => {
    const hit = scoreSupplierSection(section, index);
    return { ...section, ...hit };
  });

  const eligible = scored.filter((s) => s.kind === "header" || s.kind === "supplier");
  eligible.sort((a, b) => b.score - a.score);
  const best = eligible[0] && eligible[0].score >= 40 ? eligible[0] : null;

  const buyerSec = scored.find((s) => s.kind === "buyer");
  const shipSec = scored.find((s) => s.kind === "ship");
  const mfgSec = scored.find((s) => s.kind === "manufacturer");

  let supplierDetails = best ? partyFromSection(best, best.name) : emptyParty();
  if (!supplierDetails.name && best?.score < 50) {
    supplierDetails = emptyParty();
  }

  const joined = supplierDetails.name.replace(/\s+/g, " ");
  if (/cod\s+authoris[e]?d\s+distributors/i.test(joined) || /authoris[e]?d\s+distributors/i.test(joined) && /cod/i.test(joined)) {
    supplierDetails.name = "";
    supplierDetails.legalName = "";
  }

  const buyerDetails = buyerSec ? partyFromSection(buyerSec) : emptyParty();
  if (shipSec?.text) {
    buyerDetails.shippingAddress = metaFromText(shipSec.text).address || companyNameFromLines(shipSec.lines, "ship");
  }

  const manufacturerDetails = {
    label: mfgSec ? "Authorised Distributors / Manufacturer" : "",
    names: mfgSec
      ? mfgSec.lines
          .map((l) => cleanSpace(l))
          .filter((l) => l && !/^&?\s*deals\s+in/i.test(l))
      : [],
    raw: mfgSec?.text || "",
  };

  const needsReview = !supplierDetails.name;

  return {
    supplierDetails,
    buyerDetails,
    manufacturerDetails,
    needsReview,
    debug: {
      sections: scored.map((s) => ({
        kind: s.kind,
        score: s.score,
        name: s.name || "",
        gstin: s.meta?.gstin || "",
        preview: cleanSpace(s.text).slice(0, 180),
      })),
      selectedKind: best?.kind || null,
      selectedScore: best?.score ?? 0,
    },
  };
}

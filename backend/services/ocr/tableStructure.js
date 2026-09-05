/**
 * Reconstruct invoice tables from OCR word bounding boxes (or synthesized positions).
 * Does not guess field order. Uncertain cells stay null.
 */
import { headerAliasKey, GSTIN_RE, PHONE_TOKEN_RE } from "./billColumns.js";
import { stripCurrencyNoise } from "./textNormalizer.js";
import { classifyInvoiceLine, hasProductEvidence, hasProductDescription } from "./productTableGuard.js";

function parseAmountLocal(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (GSTIN_RE.test(s)) return null;
  if (/^\+?\d{10,13}$/.test(s.replace(/[\s-]/g, ""))) return null;
  if (/[A-Za-z]{3,}/.test(s) && !/^(rs|inr)$/i.test(s)) return null;
  const cleaned = stripCurrencyNoise(s).replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function bboxOf(raw) {
  const b = raw?.bbox || raw || {};
  const x0 = Number(b.x0 ?? b.x ?? raw?.x ?? 0);
  const y0 = Number(b.y0 ?? b.y ?? raw?.y ?? 0);
  const x1 = Number(b.x1 ?? (x0 + Number(raw?.width || b.width || 0)));
  const y1 = Number(b.y1 ?? (y0 + Number(raw?.height || b.height || 0)));
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  };
}

export function normalizeOcrWord(raw, page = 1) {
  const box = bboxOf(raw);
  return {
    text: String(raw?.text || "").trim(),
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : null,
    page,
    ...box,
  };
}

export function wordsFromTesseractData(data, page = 1) {
  const list = [];
  const src = Array.isArray(data?.words) ? data.words : [];
  for (const w of src) {
    const word = normalizeOcrWord(w, page);
    if (word.text) list.push(word);
  }
  if (list.length) return list;
  for (const ln of data?.lines || []) {
    const lineWords = Array.isArray(ln.words) ? ln.words : [];
    if (lineWords.length) {
      for (const w of lineWords) {
        const word = normalizeOcrWord(w, page);
        if (word.text) list.push(word);
      }
    } else if (ln.text && ln.bbox) {
      const base = normalizeOcrWord({ text: ln.text, bbox: ln.bbox, confidence: ln.confidence }, page);
      if (base.text) list.push(base);
    }
  }
  return list;
}

/** Approximate word boxes from plain PDF/text lines when Tesseract boxes are missing. */
export function synthesizeWordsFromText(text, page = 1) {
  const words = [];
  String(text || "")
    .split(/\n/)
    .forEach((line, li) => {
      const y = li * 22;
      let x = 0;
      const wide = /\t|\s{2,}/.test(line);
      const chunks = line.split(/(\s{2,}|\t)/);
      for (const chunk of chunks) {
        if (/^\s+$/.test(chunk)) {
          x += Math.max(16, chunk.length * 7);
          continue;
        }
        const toks = chunk.split(/\s+/).filter(Boolean);
        for (const t of toks) {
          const width = Math.max(10, t.length * 8);
          words.push({
            text: t,
            confidence: 80,
            page,
            x,
            y,
            width,
            height: 16,
            cx: x + width / 2,
            cy: y + 8,
            synthetic: true,
            packed: !wide,
          });
          x += width + 8;
        }
      }
    });
  return words;
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return 16;
  return a[Math.floor(a.length / 2)];
}

export function clusterRows(words, page) {
  const list = (words || []).filter((w) => w.page === page && w.text);
  if (!list.length) return [];
  const h = median(list.map((w) => w.height || 16));
  const tol = Math.max(8, h * 0.55);
  const sorted = [...list].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const rows = [];
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(w.cy - last.cy) <= tol) {
      last.words.push(w);
      last.cy = (last.cy * (last.words.length - 1) + w.cy) / last.words.length;
    } else {
      rows.push({ cy: w.cy, y: w.y, words: [w], page });
    }
  }
  for (const row of rows) {
    row.words.sort((a, b) => a.cx - b.cx);
    row.text = row.words.map((w) => w.text).join(" ");
  }
  return rows;
}

function matchHeadersOnRow(row) {
  const words = row.words || [];
  const used = new Set();
  const columns = [];
  for (let i = 0; i < words.length; i += 1) {
    if (used.has(i)) continue;
    let best = null;
    for (let j = i; j < Math.min(words.length, i + 4); j += 1) {
      const phrase = words
        .slice(i, j + 1)
        .map((w) => w.text)
        .join(" ");
      const key = headerAliasKey(phrase);
      if (key) {
        const cx =
          words.slice(i, j + 1).reduce((s, w) => s + w.cx, 0) / (j - i + 1);
        best = { key, text: phrase, x: cx, from: i, to: j };
      }
    }
    if (best) {
      columns.push({ key: best.key, text: best.text, x: best.x });
      for (let k = best.from; k <= best.to; k += 1) used.add(k);
      i = best.to;
    }
  }
  const keys = new Set(columns.map((c) => c.key));
  const ok =
    keys.size >= 3 &&
    keys.has("qty") &&
    (keys.has("rate") || keys.has("amount") || keys.has("description") || keys.has("sku"));
  return ok ? columns : null;
}

function headerColumnsReliable(row, columns) {
  if (!columns || columns.length < 3) return false;
  const words = row.words || [];
  const allPacked = words.length > 0 && words.every((w) => w.packed);
  if (allPacked) return false;
  const xs = columns.map((c) => c.x).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < xs.length; i += 1) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
  return minGap >= 28;
}

function isIdentityToken(text) {
  const s = String(text || "").trim();
  if (GSTIN_RE.test(s)) return true;
  if (PHONE_TOKEN_RE.test(s.replace(/\s/g, ""))) return true;
  return false;
}

function nearestColumn(word, columns) {
  if (!columns.length) return null;
  let best = null;
  let bestDist = Infinity;
  for (const col of columns) {
    const d = Math.abs(word.cx - col.x);
    if (d < bestDist) {
      bestDist = d;
      best = col;
    }
  }
  const xs = columns.map((c) => c.x).sort((a, b) => a - b);
  let gap = 80;
  for (let i = 1; i < xs.length; i += 1) gap = Math.min(gap, (xs[i] - xs[i - 1]) / 2);
  const maxDist = Math.max(36, gap);
  if (bestDist > maxDist) return null;
  return best;
}

function plausibleQty(n) {
  if (n == null || !Number.isFinite(n) || n <= 0 || n > 5000) return false;
  const whole = String(Math.trunc(n));
  if (whole.length >= 6) return false;
  return true;
}

export function uniqueQtyRateAmount(numbers) {
  const nums = (numbers || []).filter((n) => n != null && Number.isFinite(n) && n >= 0);
  if (nums.length < 3) return null;
  const hits = [];
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = 0; j < nums.length; j += 1) {
      if (i === j) continue;
      const qty = nums[i];
      const rate = nums[j];
      if (qty <= 0 || qty > 5000) continue;
      const prod = qty * rate;
      for (let k = 0; k < nums.length; k += 1) {
        if (k === i || k === j) continue;
        const amt = nums[k];
        const tol = Math.max(0.5, Math.min(2, Math.abs(amt) * 0.02));
        if (Math.abs(prod - amt) <= tol) {
          hits.push({ quantity: qty, rate, total: amt });
        }
      }
    }
  }
  if (!hits.length) return null;
  const key = (h) => `${h.quantity}|${h.rate}|${h.total}`;
  let uniq = [...new Map(hits.map((h) => [key(h), h])).values()];
  if (
    uniq.length === 2 &&
    uniq[0].total === uniq[1].total &&
    uniq[0].quantity === uniq[1].rate &&
    uniq[0].rate === uniq[1].quantity
  ) {
    uniq = [uniq[0].quantity <= uniq[1].quantity ? uniq[0] : uniq[1]];
  }
  if (uniq.length !== 1) return null;
  return uniq[0];
}

function assignRowToColumns(row, columns) {
  const buckets = {};
  for (const col of columns) buckets[col.key] = [];
  const leftover = [];
  const qtyCol = columns.find((c) => c.key === "qty");
  for (const word of row.words) {
    if (isIdentityToken(word.text)) continue;
    const col = nearestColumn(word, columns);
    if (col) buckets[col.key].push(word);
    else leftover.push(word);
  }
  if (qtyCol) {
    for (const w of leftover) {
      if (w.cx < qtyCol.x) {
        const dest = buckets.description ? "description" : buckets.sku ? "sku" : null;
        if (dest) buckets[dest].push(w);
      }
    }
  }

  const join = (key) => (buckets[key] || []).map((w) => w.text).join(" ").trim();
  const firstNum = (key) => {
    for (const w of buckets[key] || []) {
      if (/%/.test(w.text)) {
        const n = parseAmountLocal(w.text.replace(/%/g, ""));
        if (n != null) return n;
      }
      const n = parseAmountLocal(w.text);
      if (n == null) continue;
      if (key === "qty" && !plausibleQty(n)) continue;
      return n;
    }
    return null;
  };

  const hsnFromQtyBucket = () => {
    for (const w of buckets.qty || []) {
      const digits = String(w.text).replace(/\D/g, "");
      if (/^\d{4,8}$/.test(digits) && digits.length >= 6) return digits;
    }
    return "";
  };

  const assigned = {
    sku: join("sku"),
    description: join("description") || join("sku"),
    hsn: join("hsn").replace(/\D/g, "") || hsnFromQtyBucket() || "",
    quantity: firstNum("qty"),
    rate: firstNum("rate"),
    discount: firstNum("discount"),
    gstRate: firstNum("gst") ?? firstNum("igst") ?? (firstNum("cgst") != null && firstNum("sgst") != null ? firstNum("cgst") + firstNum("sgst") : null),
    total: firstNum("amount"),
    source: "columns",
  };

  if (assigned.quantity == null || assigned.rate == null || assigned.total == null) {
    if (
      classifyInvoiceLine(row.text).code === "CANDIDATE" &&
      hasProductDescription(assigned.description || assigned.sku, row.text)
    ) {
      const nums = row.words.map((w) => parseAmountLocal(w.text)).filter((n) => n != null && !isIdentityToken(String(n)));
      const inferred = uniqueQtyRateAmount(nums);
      if (inferred) {
        if (assigned.quantity == null) assigned.quantity = inferred.quantity;
        if (assigned.rate == null) assigned.rate = inferred.rate;
        if (assigned.total == null) assigned.total = inferred.total;
        assigned.source = assigned.source === "columns" ? "columns+math" : "math";
      }
    }
  }

  if (assigned.quantity != null && assigned.rate != null) {
    assigned.taxableAmount = Number((assigned.quantity * assigned.rate - (assigned.discount || 0)).toFixed(2));
  }

  assigned.raw = row.text;
  assigned.y = row.cy;
  assigned.page = row.page;
  assigned.confidenceByField = {
    productName: assigned.description || assigned.sku ? 80 : 0,
    quantity: assigned.quantity != null ? (assigned.source.startsWith("columns") ? 88 : 62) : 0,
    rate: assigned.rate != null ? (assigned.source.startsWith("columns") ? 86 : 60) : 0,
    total: assigned.total != null ? (assigned.source.startsWith("columns") ? 86 : 60) : 0,
  };
  return assigned;
}

function isProductRow(assigned, row) {
  const t = String(row.text || "");
  if (matchHeadersOnRow(row)) return false;
  if (isIdentityToken(t)) return false;
  return hasProductEvidence({ ...assigned, raw: t }).ok;
}

function mathNeedsReview(assigned) {
  const qty = assigned.quantity;
  const rate = assigned.rate;
  const total = assigned.total;
  const disc = assigned.discount || 0;
  if (qty == null || rate == null) return true;
  if (total == null) return false;
  const expected = qty * rate - disc;
  return Math.abs(expected - total) > Math.max(2, Math.abs(total) * 0.05);
}

export function reconstructTables(allWords) {
  const pages = [...new Set((allWords || []).map((w) => w.page || 1))].sort((a, b) => a - b);
  const debug = {
    strategy: "positional",
    state: "BEFORE_PRODUCT_TABLE",
    headers: [],
    columns: [],
    rows: [],
    rejected: [],
    tableStart: null,
    tableEnd: null,
    pages: [],
  };
  const items = [];
  let globalColumns = null;
  let state = "BEFORE_PRODUCT_TABLE";

  for (const page of pages) {
    const rows = clusterRows(allWords, page);
    let columns = null;
    let headerRow = null;
    for (const row of rows) {
      const cols = matchHeadersOnRow(row);
      if (cols && headerColumnsReliable(row, cols)) {
        columns = cols;
        headerRow = row;
        globalColumns = cols;
        debug.headers.push({ page, text: row.text, columns: cols });
        debug.tableStart = { page, text: row.text };
        state = "PRODUCT_HEADER_FOUND";
        break;
      }
    }
    if (!columns && globalColumns) columns = globalColumns;
    debug.pages.push({ page, rowCount: rows.length, header: headerRow?.text || null });
    if (!columns) continue;
    if (!headerRow && (state === "TAX_SUMMARY_SECTION" || state === "END_PRODUCT_TABLE")) {
      debug.pages[debug.pages.length - 1].skipped = "table_already_ended";
      continue;
    }
    if (headerRow) state = "PRODUCT_ROWS";
    else state = "PRODUCT_ROWS";

    debug.columns = columns.map((c) => ({ key: c.key, x: Math.round(c.x), text: c.text }));

    let pastHeader = !headerRow;
    for (const row of rows) {
      if (state === "TAX_SUMMARY_SECTION" || state === "END_PRODUCT_TABLE") break;
      if (headerRow && row === headerRow) {
        pastHeader = true;
        continue;
      }
      if (!pastHeader) {
        debug.rejected.push({ page, text: row.text, reason: "BEFORE_PRODUCT_TABLE" });
        continue;
      }
      if (matchHeadersOnRow(row)) continue;
      const classified = classifyInvoiceLine(row.text);
      if (classified.code === "TAX_SUMMARY_SECTION" || classified.code === "TOTAL_SECTION" || classified.code === "FOOTER_SECTION") {
        state = classified.code === "FOOTER_SECTION" ? "END_PRODUCT_TABLE" : "TAX_SUMMARY_SECTION";
        debug.tableEnd = { page, text: row.text, reason: classified.reason };
        debug.rejected.push({ page, text: row.text, reason: classified.reason || classified.code });
        break;
      }
      const assigned = assignRowToColumns(row, columns);
      const evidence = hasProductEvidence({ ...assigned, raw: row.text });
      if (!evidence.ok) {
        debug.rejected.push({ page, text: row.text, reason: evidence.reason || "NOT_A_PRODUCT" });
        continue;
      }
      if (!isProductRow(assigned, row)) {
        debug.rejected.push({ page, text: row.text, reason: "NOT_A_PRODUCT" });
        continue;
      }
      const review = mathNeedsReview(assigned) || !assigned.description || assigned.quantity == null;
      assigned.needsReview = review;
      if (review && assigned.confidenceByField) {
        if (mathNeedsReview(assigned)) assigned.confidenceByField.total = Math.min(assigned.confidenceByField.total, 45);
      }
      items.push(assigned);
      debug.rows.push({
        page,
        y: Math.round(row.cy),
        text: row.text,
        assigned: {
          description: assigned.description || null,
          sku: assigned.sku || null,
          quantity: assigned.quantity,
          rate: assigned.rate,
          discount: assigned.discount,
          gstRate: assigned.gstRate,
          total: assigned.total,
          source: assigned.source,
          needsReview: assigned.needsReview,
        },
      });
    }
  }

  debug.state = state;
  return { items, debug, columns: globalColumns };
}

export function collectWordsFromPages(pages) {
  const words = [];
  for (const p of pages || []) {
    const page = p.page || 1;
    if (Array.isArray(p.words) && p.words.length) {
      for (const w of p.words) {
        const word = normalizeOcrWord(w, page);
        if (word.text) words.push(word);
      }
    } else if (p.text) {
      words.push(...synthesizeWordsFromText(p.text, page));
    }
  }
  return words;
}

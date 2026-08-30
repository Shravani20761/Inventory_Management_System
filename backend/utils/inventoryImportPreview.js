/**
 * Excel/CSV import preview & validated import with user column mapping.
 */
import {
  readWorkbookBestSheet,
  resolveSheetHeaderMapping,
  buildColToKeyFromExplicitMapping,
  evaluateRequiredFields,
  cellString,
  parseBatteryExcelFile,
} from "../shared/utils/excelParser.js";
import {
  getAllFieldOptionsForImportType,
  getFieldLabel,
  isValidFieldKeyForImportType,
} from "../shared/constants/inventoryColumnMapping.js";

function fakeFileFromBuffer(buffer, name = "inventory-upload.xlsx") {
  const u8 = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const ab = u8.slice().buffer;
  return {
    size: u8.byteLength,
    name,
    arrayBuffer: async () => ab,
  };
}

/**
 * Analyze uploaded file headers — mapping by column NAME, not position.
 * @param {Buffer|Uint8Array} buffer
 * @param {string} importType
 * @param {{ columnMappingByIndex?: Record<string,string> }} [opts]
 */
export async function analyzeInventoryExcelUpload(buffer, importType, opts = {}) {
  const u8 = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(buffer);
  if (!u8.byteLength) {
    return { ok: false, errors: ["The file is empty (0 bytes)."] };
  }

  let bestPick;
  try {
    ({ bestPick } = readWorkbookBestSheet(u8, importType));
  } catch (e) {
    return { ok: false, errors: [e?.message || "Unable to read Excel file."] };
  }

  const aoa = bestPick.aoa || [];
  if (!aoa.length) {
    return { ok: false, errors: ["Excel workbook has no readable rows."] };
  }

  const userMapping = opts.columnMappingByIndex || {};
  const resolved = resolveSheetHeaderMapping(aoa, importType, { columnMappingByIndex: userMapping });

  if (!resolved.ok) {
    return {
      ok: false,
      errors: resolved.errors || ["Could not find a header row with recognizable inventory columns."],
    };
  }

  const { columns, duplicateFields, colToKey, dataStart, headerIdx } = resolved;
  const requiredFields = evaluateRequiredFields(importType, colToKey);
  const availableFields = getAllFieldOptionsForImportType(importType);
  const totalRows = Math.max(0, aoa.length - dataStart);

  const sampleRows = [];
  for (let r = dataStart; r < Math.min(aoa.length, dataStart + 5) && sampleRows.length < 3; r++) {
    const arr = aoa[r] || [];
    const row = {};
    let hasData = false;
    for (const [jStr, key] of Object.entries(colToKey)) {
      const v = cellString(arr[Number(jStr)] ?? "").trim();
      if (v) {
        row[key] = v;
        hasData = true;
      }
    }
    if (hasData) sampleRows.push(row);
  }

  const mappingPreview = columns.map((col) => {
    const userKey = userMapping[String(col.index)];
    const effectiveKey = colToKey[col.index] ?? (userKey && userKey !== "__ignore__" ? userKey : col.mappedField);
    const isMapped = Boolean(effectiveKey);
    return {
      ...col,
      effectiveField: effectiveKey || null,
      effectiveLabel: effectiveKey ? getFieldLabel(importType, effectiveKey) : null,
      userOverride: userKey != null,
      displayStatus: isMapped ? "mapped" : col.header && col.header !== `(Column ${col.index + 1})` ? "unmapped" : "empty",
    };
  });

  const unresolvedDuplicates = duplicateFields.filter((d) => d.columns.length > 1);

  return {
    ok: true,
    sheetName: bestPick.sheetName,
    headerRowIndex: headerIdx,
    totalRows,
    columns: mappingPreview,
    duplicateFields: unresolvedDuplicates,
    requiredFields,
    availableFields,
    sampleRows,
    columnMappingByIndex: Object.fromEntries(Object.entries(colToKey).map(([j, k]) => [String(j), k])),
    unmappedColumns: mappingPreview.filter((c) => c.displayStatus === "unmapped"),
    canImport:
      requiredFields.every((f) => f.satisfied) &&
      unresolvedDuplicates.every((d) => {
        const mapped = Object.entries(colToKey).filter(([, k]) => k === d.fieldKey);
        return mapped.length <= 1;
      }),
  };
}

/**
 * Validate user mapping before import (backend security — do not trust frontend alone).
 */
export function validateImportColumnMapping(importType, columnMappingByIndex, duplicateSelections = {}) {
  const errors = [];
  const { colToKey, errors: buildErrors } = buildColToKeyFromExplicitMapping(
    columnMappingByIndex,
    importType,
  );
  errors.push(...buildErrors);

  for (const [idxStr, fieldKey] of Object.entries(columnMappingByIndex || {})) {
    if (fieldKey === "__ignore__" || !fieldKey) continue;
    if (!isValidFieldKeyForImportType(importType, fieldKey)) {
      errors.push(`Column ${idxStr}: "${fieldKey}" is not a valid field for this category.`);
    }
  }

  const fieldUse = new Map();
  for (const [idxStr, fieldKey] of Object.entries(columnMappingByIndex || {})) {
    if (!fieldKey || fieldKey === "__ignore__") continue;
    if (!fieldUse.has(fieldKey)) fieldUse.set(fieldKey, []);
    fieldUse.get(fieldKey).push(Number(idxStr));
  }
  for (const [fieldKey, indices] of fieldUse) {
    if (indices.length > 1) {
      const chosen = duplicateSelections[fieldKey];
      if (chosen == null || !indices.includes(Number(chosen))) {
        errors.push(
          `Multiple columns map to "${getFieldLabel(importType, fieldKey)}". Choose which column to use.`,
        );
      }
    }
  }

  const required = evaluateRequiredFields(importType, colToKey);
  const missing = required.filter((r) => !r.satisfied);
  if (missing.length) {
    errors.push(`Missing required columns: ${missing.map((m) => m.label).join(", ")}.`);
  }

  return { ok: errors.length === 0, errors, colToKey, requiredFields: required };
}

/**
 * Parse with validated column mapping (header-based).
 */
export async function parseInventoryExcelWithMapping(buffer, importType, options = {}) {
  const { columnMappingByIndex, duplicateSelections = {} } = options;
  const validation = validateImportColumnMapping(importType, columnMappingByIndex, duplicateSelections);
  if (!validation.ok) {
    return {
      batteries: [],
      errors: validation.errors,
      mappedColumns: {},
      validationFailed: true,
    };
  }

  const fakeFile = fakeFileFromBuffer(buffer, options.fileName);
  return parseBatteryExcelFile(fakeFile, { importType, columnMappingByIndex });
}

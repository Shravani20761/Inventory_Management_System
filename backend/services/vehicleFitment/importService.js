import * as XLSX from "xlsx";
import { upsertVehicleRecord, findOrCreateFitmentGroup } from "./catalogService.js";

const REQUIRED = ["vehicleType", "brand", "model"];

function cell(row, key) {
  const hit = Object.keys(row).find((k) => k.trim().toLowerCase().replace(/\s+/g, "") === key.toLowerCase().replace(/\s+/g, ""));
  return hit ? row[hit] : row[key];
}

function normalizeRow(raw) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = cell(raw, k);
      if (v != null && String(v).trim() !== "") return v;
    }
    return "";
  };
  return {
    vehicleType: String(get("vehicleType", "vehicle type", "type")).trim(),
    brand: String(get("brand", "vehicleBrand")).trim(),
    model: String(get("model", "vehicleModel")).trim(),
    variant: String(get("variant", "variantName")).trim(),
    fuelType: String(get("fuelType", "fuel")).trim(),
    yearFrom: get("yearFrom", "year from"),
    yearTo: get("yearTo", "year to"),
    voltage: get("voltage"),
    minAh: get("minAh", "min ah"),
    maxAh: get("maxAh", "max ah"),
    batteryType: String(get("batteryType", "battery type")).trim(),
    length: get("length"),
    width: get("width"),
    height: get("height"),
    terminalConfiguration: String(get("terminalConfiguration", "terminal")).trim(),
    polarity: String(get("polarity")).trim(),
    fitmentGroup: String(get("fitmentGroup", "fitment", "fitmentName")).trim(),
  };
}

export function parseFitmentWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export async function importVehicleFitments(buffer) {
  const rawRows = parseFitmentWorkbook(buffer);
  const summary = { totalRows: rawRows.length, validRows: 0, invalidRows: 0, duplicateRows: 0, importedRows: 0, errors: [] };
  let i = 0;
  for (const raw of rawRows) {
    i += 1;
    const row = normalizeRow(raw);
    const missing = REQUIRED.filter((k) => !row[k]);
    if (missing.length) {
      summary.invalidRows += 1;
      summary.errors.push({ row: i, error: `Missing ${missing.join(", ")}`, data: row });
      continue;
    }
    if (!row.fitmentGroup && (row.voltage || row.minAh || row.maxAh || row.batteryType)) {
      row.fitmentGroup = ["FIT", row.voltage && `${row.voltage}V`, row.minAh != null && row.minAh !== "" && `${row.minAh}`, row.maxAh != null && row.maxAh !== "" && `${row.maxAh}`, row.batteryType]
        .filter(Boolean)
        .join("-")
        .slice(0, 80);
    }
    try {
      if (row.fitmentGroup) {
        await findOrCreateFitmentGroup({ ...row, name: row.fitmentGroup });
      }
      await upsertVehicleRecord(row);
      summary.validRows += 1;
      summary.importedRows += 1;
    } catch (e) {
      if (e.status === 409) {
        summary.validRows += 1;
        summary.duplicateRows += 1;
        summary.errors.push({ row: i, error: "Duplicate vehicle combination", data: row });
      } else {
        summary.invalidRows += 1;
        summary.errors.push({ row: i, error: e.message || "Import failed", data: row });
      }
    }
  }
  return summary;
}

export function fitmentTemplateCsv() {
  return [
    "vehicleType,brand,model,variant,fuelType,yearFrom,yearTo,voltage,minAh,maxAh,batteryType,length,width,height,terminalConfiguration,polarity,fitmentGroup",
    "Car,EXAMPLE-BRAND,EXAMPLE-MODEL,EXAMPLE-VARIANT,Petrol,2020,2024,12,35,45,Automotive,,,,EXAMPLE-FITMENT-001",
  ].join("\n");
}

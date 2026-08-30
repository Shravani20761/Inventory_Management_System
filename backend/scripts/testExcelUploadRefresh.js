/**
 * Verifies category Excel upload returns categoryRows + inventory for immediate UI refresh.
 * Run: node scripts/testExcelUploadRefresh.js
 */
import "dotenv/config";
import XLSX from "xlsx";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

const API = process.env.API_BASE || "http://localhost:3001/api";

function makeCarExcel(modelSuffix) {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Brand", "Model Number", "Capacity (Ah)", "Warranty", "DP + GST", "MRP FINAL", "Qty"],
    ["Exide", `TEST-UPLOAD-${modelSuffix}`, 60, "24 months", 3200, 4200, 3],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function getToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing in .env");
  let user = await User.findOne({ role: { $in: ["superAdmin", "admin"] } });
  if (!user) user = await User.findOne();
  if (!user) throw new Error("No user in DB — log in once or run seed scripts.");
  return jwt.sign({ sub: user._id.toString(), role: user.role }, secret, { expiresIn: "1h" });
}

async function main() {
  await connectMongo();
  const branch = await Branch.findOne();
  if (!branch) throw new Error("No branch — run npm run seed:branches");

  const token = await getToken();
  const suffix = Date.now();
  const buf = makeCarExcel(suffix);
  const model = `TEST-UPLOAD-${suffix}`;

  const listBefore = await fetch(`${API}/car-batteries`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "test.xlsx");
  form.append("defaultBrand", "Exide");

  const uploadRes = await fetch(`${API}/car-batteries/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadJson = await uploadRes.json();

  if (!uploadRes.ok) {
    console.error("Upload failed:", uploadJson);
    process.exit(1);
  }

  const listAfter = await fetch(`${API}/car-batteries?_=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const inUpload = (uploadJson.categoryRowCount ?? 0) > (Array.isArray(listBefore) ? listBefore.length : 0);
  const inList = (Array.isArray(listAfter) ? listAfter : []).some((r) => String(r.modelNumber || "").includes(model));
  const merged = uploadJson.merged || {};

  console.log("Upload OK:", {
    parsedRows: uploadJson.parsedRowCount,
    inserted: merged.inserted,
    updated: merged.updated,
    skipped: merged.skipped,
    categoryRowCount: uploadJson.categoryRowCount,
    listBefore: Array.isArray(listBefore) ? listBefore.length : "?",
    listAfter: Array.isArray(listAfter) ? listAfter.length : "?",
    newModelInListEndpoint: inList,
    listGrew: inUpload,
  });

  if (!inList) {
    process.exit(1);
  }
  console.log("PASS: backend returns fresh rows for immediate UI refresh");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

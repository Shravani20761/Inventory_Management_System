/** Quick check: car battery list counts by brand chip (mirrors UI filters). */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { connectMongo } from "../config/mongodb.js";
import User from "../models/User.js";

const API = "http://localhost:3001/api";

function normalizeBrand(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function canonicalAutomotiveBrand(raw) {
  const n = normalizeBrand(raw);
  if (!n || n === "unknown") return "";
  if (n.startsWith("exide")) return "Exide";
  if (n.startsWith("amaron")) return "Amaron";
  return String(raw ?? "").trim();
}
function brandMatches(rowBrand, filterBrand) {
  return normalizeBrand(rowBrand) === normalizeBrand(filterBrand);
}

async function getToken() {
  const user = (await User.findOne({ role: { $in: ["superAdmin", "admin"] } })) || (await User.findOne());
  if (!user) throw new Error("No user");
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

await connectMongo();
const token = await getToken();
const rows = await fetch(`${API}/car-batteries`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());

const carRows = rows.filter((r) => {
  const t = String(r.type ?? "").trim().toLowerCase();
  return t === "car" || t === "truck";
});

const exide = carRows.filter((r) => brandMatches(canonicalAutomotiveBrand(r.brand) || r.brand, "Exide"));
const amaron = carRows.filter((r) => brandMatches(canonicalAutomotiveBrand(r.brand) || r.brand, "Amaron"));
const other = carRows.filter((r) => {
  const b = canonicalAutomotiveBrand(r.brand) || String(r.brand ?? "").trim();
  return b && !brandMatches(b, "Exide") && !brandMatches(b, "Amaron");
});
const unknown = carRows.filter((r) => !String(r.brand ?? "").trim() || normalizeBrand(r.brand) === "unknown");

console.log("Car battery UI chip counts (branch list from GET /car-batteries):");
console.log({
  totalCarRows: carRows.length,
  exideChip: exide.length,
  amaronChip: amaron.length,
  otherChip: other.length + unknown.length,
  sampleUnknownBrand: unknown.slice(0, 3).map((r) => ({ model: r.modelNumber, brand: r.brand })),
});
console.log("\nIf Exide chip shows 0 but Other has rows, uploaded Excel without brand lands under Other.");
process.exit(0);

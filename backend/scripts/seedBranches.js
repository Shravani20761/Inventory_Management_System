/**
 * Seed Wakad, Ravet, Pimple Saudagar with business display names.
 * Run: npm run seed:branches --prefix backend
 */
import "dotenv/config";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";

const BRANCHES = [
  {
    branchId: "wakad",
    branchName: "Wakad",
    name: "Wakad",
    code: "WAKAD",
    businessName: "BatteryMela",
    address: "Datta Mandir Road, Wakad",
    city: "Pune",
    phone: "7798234598",
    email: "wakad@batterymela.com",
    gstin: "",
    active: true,
    status: "active",
  },
  {
    branchId: "ravet",
    branchName: "Ravet",
    name: "Ravet",
    code: "RAVET",
    businessName: "BatteryMela",
    address: "Ravet, Pune",
    city: "Pune",
    phone: "",
    email: "ravet@batterymela.com",
    gstin: "",
    active: true,
    status: "active",
  },
  {
    branchId: "pimple_saudagar",
    branchName: "Pimple Saudagar",
    name: "Pimple Saudagar",
    code: "PIMPLE_SAUDAGAR",
    businessName: "Krishnaa Battery",
    address: "Pimple Saudagar, Pune",
    city: "Pune",
    phone: "",
    email: "pimple@batterymela.com",
    gstin: "",
    active: true,
    status: "active",
  },
];

await connectMongo();

for (const row of BRANCHES) {
  const existing = await Branch.findOne({
    $or: [
      { branchId: row.branchId },
      { code: row.code },
      { code: "PIMPLE" }, // migrate old code
      { name: row.name },
      { name: `${row.name} Branch` },
    ],
  });
  if (existing) {
    Object.assign(existing, row);
    await existing.save();
    console.log("Updated branch:", row.name, "→", row.businessName);
  } else {
    await Branch.create(row);
    console.log("Created branch:", row.name, "→", row.businessName);
  }
}

console.log("Branch seed complete.");
process.exit(0);

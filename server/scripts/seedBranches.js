/**
 * Seed Wakad + Pimple Saudagar branches for multi-branch ERP.
 * Run: node server/scripts/seedBranches.js
 */
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";

const BRANCHES = [
  {
    branchId: "wakad",
    branchName: "Wakad Branch",
    name: "Wakad Branch",
    code: "WAKAD",
    address: "Wakad, Pune",
    city: "Pune",
    phone: "",
    managerName: "",
    active: true,
  },
  {
    branchId: "pimple_saudagar",
    branchName: "Pimple Saudagar Branch",
    name: "Pimple Saudagar Branch",
    code: "PIMPLE",
    address: "Pimple Saudagar, Pune",
    city: "Pune",
    phone: "",
    managerName: "",
    active: true,
  },
];

await connectMongo();

for (const row of BRANCHES) {
  const existing = await Branch.findOne({
    $or: [{ branchId: row.branchId }, { code: row.code }, { name: row.name }],
  });
  if (existing) {
    Object.assign(existing, row);
    await existing.save();
    console.log("Updated branch:", row.branchName);
  } else {
    await Branch.create(row);
    console.log("Created branch:", row.branchName);
  }
}

console.log("Branch seed complete.");
process.exit(0);

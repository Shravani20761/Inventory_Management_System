/**
 * Create branch managers for Wakad / Ravet / Pimple Saudagar.
 * Run: npm run seed:branch-users --prefix backend
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import { DEFAULT_PERMISSIONS } from "../constants/roles.js";

const BRANCH_DEFS = [
  {
    branchId: "wakad",
    branchName: "Wakad",
    name: "Wakad",
    code: "WAKAD",
    businessName: "BatteryMela",
    address: "Datta Mandir Road, Wakad",
    city: "Pune",
  },
  {
    branchId: "ravet",
    branchName: "Ravet",
    name: "Ravet",
    code: "RAVET",
    businessName: "BatteryMela",
    address: "Ravet, Pune",
    city: "Pune",
  },
  {
    branchId: "pimple_saudagar",
    branchName: "Pimple Saudagar",
    name: "Pimple Saudagar",
    code: "PIMPLE_SAUDAGAR",
    businessName: "Krishnaa Battery",
    address: "Pimple Saudagar, Pune",
    city: "Pune",
  },
];

const BRANCH_USERS = [
  {
    branchId: "wakad",
    name: "Wakad Manager",
    email: "wakad@batterymela.com",
    password: "Wakad@123",
    role: "manager",
  },
  {
    branchId: "ravet",
    name: "Ravet Manager",
    email: "ravet@batterymela.com",
    password: "Ravet@123",
    role: "manager",
  },
  {
    branchId: "pimple_saudagar",
    name: "Pimple Saudagar Manager",
    email: "pimple@batterymela.com",
    password: "Pimple@123",
    role: "manager",
  },
];

await connectMongo();

for (const row of BRANCH_DEFS) {
  let branch = await Branch.findOne({
    $or: [{ branchId: row.branchId }, { code: row.code }, { code: "PIMPLE" }],
  });
  if (!branch) {
    branch = await Branch.create({ ...row, active: true, status: "active" });
    console.log("Created branch:", row.name);
  } else {
    Object.assign(branch, { ...row, active: true, status: "active" });
    await branch.save();
    console.log("Updated branch:", row.name);
  }
}

for (const u of BRANCH_USERS) {
  const branch = await Branch.findOne({ branchId: u.branchId });
  if (!branch) {
    console.warn("Branch missing:", u.branchId);
    continue;
  }
  const hash = await bcrypt.hash(u.password, 10);
  const existing = await User.findOne({ email: u.email.toLowerCase() });
  if (existing) {
    existing.name = u.name;
    existing.password = hash;
    existing.role = u.role;
    existing.branchId = branch._id;
    existing.permissions = DEFAULT_PERMISSIONS[u.role] || [];
    existing.active = true;
    await existing.save();
    console.log("Updated user:", u.email, "→", branch.businessName, "/", branch.name);
  } else {
    await User.create({
      name: u.name,
      email: u.email.toLowerCase(),
      password: hash,
      role: u.role,
      branchId: branch._id,
      permissions: DEFAULT_PERMISSIONS[u.role] || [],
      active: true,
    });
    console.log("Created user:", u.email, "→", branch.businessName, "/", branch.name);
  }
}

console.log("\n--- Manager logins ---");
for (const u of BRANCH_USERS) {
  console.log(`${u.email} / ${u.password} (${u.branchId})`);
}
console.log("\nHQ Admin: use BOOTSTRAP / existing superAdmin account");
process.exit(0);

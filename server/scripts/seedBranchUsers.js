/**
 * Create Wakad + Pimple Saudagar branch users and optional demo stock.
 * Run: npm run seed:branch-users
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import { DEFAULT_PERMISSIONS } from "../constants/roles.js";

const BRANCH_USERS = [
  {
    branchId: "wakad",
    name: "Wakad Branch Manager",
    email: "wakad@batterymela.com",
    password: "Wakad@123",
    role: "admin",
  },
  {
    branchId: "pimple_saudagar",
    name: "Pimple Saudagar Manager",
    email: "pimple@batterymela.com",
    password: "Pimple@123",
    role: "admin",
  },
];

await connectMongo();

for (const row of [
  {
    branchId: "wakad",
    branchName: "Wakad Branch",
    name: "Wakad Branch",
    code: "WAKAD",
    address: "Wakad, Pune",
    city: "Pune",
  },
  {
    branchId: "pimple_saudagar",
    branchName: "Pimple Saudagar Branch",
    name: "Pimple Saudagar Branch",
    code: "PIMPLE",
    address: "Pimple Saudagar, Pune",
    city: "Pune",
  },
]) {
  let branch = await Branch.findOne({ branchId: row.branchId });
  if (!branch) {
    branch = await Branch.create({ ...row, active: true });
    console.log("Created branch:", row.branchName);
  } else {
    Object.assign(branch, row);
    await branch.save();
    console.log("Updated branch:", row.branchName);
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
    console.log("Updated user:", u.email, "→", branch.branchName || branch.name);
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
    console.log("Created user:", u.email, "→", branch.branchName || branch.name);
  }
}

console.log("\n--- Branch login credentials ---");
for (const u of BRANCH_USERS) {
  console.log(`${u.email} / ${u.password} (${u.branchId})`);
}
console.log("\nSuper admin (all branches): shravanijadhav921@gmail.com / password@123");
process.exit(0);

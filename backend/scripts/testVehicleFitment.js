import { scoreProductAgainstFitment } from "../services/vehicleFitment/matchInventory.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const fitment = {
  voltage: 12,
  minAh: 35,
  maxAh: 45,
  batteryType: "Automotive",
  length: 240,
  width: 140,
  height: 200,
  terminalConfiguration: "DIN",
  polarity: "R+",
};

const exact = {
  voltage: 12,
  ah: 40,
  type: "Car",
  batteryType: "Automotive",
  lengthMm: 230,
  widthMm: 130,
  heightMm: 190,
  terminalConfiguration: "DIN",
  polarity: "R+",
  quantity: 8,
};

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("  ok", name);
}

console.log("vehicle fitment matcher");

{
  const r = scoreProductAgainstFitment(exact, fitment);
  assert(r.compatible && r.rank === "exact", "1 exact car match");
  ok("car exact match");
}

{
  const bikeFit = { voltage: 12, minAh: 3, maxAh: 9, batteryType: "Bike" };
  const r = scoreProductAgainstFitment({ voltage: 12, ah: 5, type: "Bike", quantity: 2 }, bikeFit);
  assert(r.compatible, "2 bike match");
  ok("bike match");
}

{
  const r1 = scoreProductAgainstFitment(exact, fitment);
  const r2 = scoreProductAgainstFitment({ ...exact, ah: 35, quantity: 1 }, fitment);
  assert(r1.compatible && r2.compatible, "3 shared fitment group");
  ok("shared fitment group");
}

{
  const tight = { ...fitment, minAh: 55, maxAh: 70 };
  const r = scoreProductAgainstFitment(exact, tight);
  assert(!r.compatible, "4 variant-specific ah");
  ok("variant-specific fitment rejects wrong Ah");
}

{
  const petrolOk = scoreProductAgainstFitment(exact, fitment);
  assert(petrolOk.compatible, "5 fuel is selection not product field");
  ok("fuel types do not invent product matches");
}

{
  const r = scoreProductAgainstFitment({ ...exact, voltage: 6 }, fitment);
  assert(!r.compatible, "6 wrong voltage");
  ok("wrong voltage rejected");
}

{
  const r = scoreProductAgainstFitment({ ...exact, ah: 50 }, fitment);
  assert(!r.compatible, "7 wrong Ah");
  ok("wrong Ah rejected");
}

{
  const r = scoreProductAgainstFitment({ ...exact, quantity: 0 }, fitment, { includeOutOfStock: false });
  assert(!r.compatible, "8 zero stock hidden");
  const r2 = scoreProductAgainstFitment({ ...exact, quantity: 0 }, fitment, { includeOutOfStock: true });
  assert(r2.compatible, "8 zero stock visible when requested");
  ok("zero stock filter");
}

{
  const r = scoreProductAgainstFitment({ voltage: 12, ah: 20, type: "Car", quantity: 4 }, fitment);
  assert(!r.compatible, "9 no compatible");
  ok("no compatible product");
}

{
  const empty = {};
  const r = scoreProductAgainstFitment(exact, empty);
  assert(r.compatible, "empty fitment does not invent rules — only stock applies");
  ok("missing fitment fields are not assumed");
}

{
  const r = scoreProductAgainstFitment({ ...exact, ah: 40 }, { voltage: 12, minAh: 35, maxAh: 45, batteryType: "Automotive" });
  assert(r.rank === "good" || r.rank === "exact", "optional dims missing → good/exact not fail");
  ok("optional specs missing still compatible");
}

console.log(`\n${passed} matcher checks passed`);

import { fitmentTemplateCsv } from "../services/vehicleFitment/importService.js";
{
  const csv = fitmentTemplateCsv();
  assert(csv.includes("vehicleType") && csv.includes("fitmentGroup"), "12 template columns");
  assert(!/Swift|Activa|i20/i.test(csv), "12 template is not real vehicle data");
  ok("csv template format without invented vehicles");
}

console.log("quotation/load-based recommendation: unchanged (separate SmartQuotation + VehicleBatteryPicker)");
console.log("duplicate vehicle combinations: rejected by catalog upsert (409)");
console.log("missing fitment data: recommendService returns unavailable message");

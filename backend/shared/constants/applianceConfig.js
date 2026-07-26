/**
 * Master wattage table for structured appliance rows (BatteryMela).
 * Imported by the server for sizing; imported by the client for dropdowns only.
 * Update when the reference PDF changes — keep keys stable for saved quotations.
 */
export const applianceConfig = {
  fan: {
    normal: 75,
    bldc: 30,
    table: 50,
    pedestal: 55,
    wall: 60,
    exhaust: 25,
  },
  light: {
    oldTube: 40,
    ledTube: 20,
    panelSmall: 15,
    panelMedium: 20,
    panelLarge: 25,
    bulbLed: 10,
    downlight: 12,
  },
  tv: {
    "14": 25,
    "24": 35,
    "32": 50,
    "40": 75,
    "43": 80,
    "50": 100,
    "55": 120,
    "60": 150,
    "65": 170,
    "70": 200,
  },
  fridgeSingleDoor: {
    "165L": 90,
    "180L": 100,
    "190L": 120,
    "200L": 150,
    "215L": 180,
    "230L": 200,
  },
  fridgeDoubleDoor: {
    "240L": 250,
    "260L": 300,
    "300L": 350,
    "350L": 400,
    "400L": 500,
    "450L": 550,
  },
  waterPurifier: {
    ro: 25,
    uvuf: 15,
    uv: 20,
  },
  mixer: {
    basic: 500,
    heavyDuty: 750,
    commercial: 1000,
  },
  charging: {
    mobile: 10,
    fastCharging: 25,
    laptop: 65,
  },
  iron: {
    dry: 750,
    steam: 1200,
  },
  washingMachine: {
    semiAuto: 400,
    topLoad: 350,
    frontLoad: 2000,
  },
  ac: {
    split1Ton: 1200,
    split1_5Ton: 1800,
    split2Ton: 2400,
    window1Ton: 1300,
  },
  pump: {
    small075hp: 560,
    onehp: 750,
    one5hp: 1120,
  },
  computer: {
    desktop: 200,
    monitor24: 30,
    wifiRouter: 10,
  },
  other: {
    misc50: 50,
    misc100: 100,
    misc200: 200,
  },
};

/** UI labels for category keys */
export const applianceCategoryLabels = {
  fan: "Fan",
  light: "Light",
  tv: "Television",
  fridgeSingleDoor: "Refrigerator (single door)",
  fridgeDoubleDoor: "Refrigerator (double door)",
  waterPurifier: "Water purifier",
  mixer: "Mixer / grinder",
  charging: "Charging (mobile / laptop)",
  iron: "Iron",
  washingMachine: "Washing machine",
  ac: "Air conditioner",
  pump: "Water pump",
  computer: "Computer / router",
  other: "Other / misc",
};

/** Human label per type key (optional; falls back to key) */
export const applianceTypeLabels = {
  fan: { normal: "Ceiling fan (normal)", bldc: "Ceiling fan (BLDC)", table: "Table fan", pedestal: "Pedestal fan", wall: "Wall fan", exhaust: "Exhaust fan" },
  light: {
    oldTube: "Tube light (old)",
    ledTube: "LED tube",
    panelSmall: "LED panel (small)",
    panelMedium: "LED panel (medium)",
    panelLarge: "LED panel (large)",
    bulbLed: "LED bulb",
    downlight: "LED downlight",
  },
  tv: {
    "14": '14"',
    "24": '24"',
    "32": '32"',
    "40": '40"',
    "43": '43"',
    "50": '50"',
    "55": '55"',
    "60": '60"',
    "65": '65"',
    "70": '70"',
  },
  fridgeSingleDoor: {
    "165L": "165 L",
    "180L": "180 L",
    "190L": "190 L",
    "200L": "200 L",
    "215L": "215 L",
    "230L": "230 L",
  },
  fridgeDoubleDoor: {
    "240L": "240 L",
    "260L": "260 L",
    "300L": "300 L",
    "350L": "350 L",
    "400L": "400 L",
    "450L": "450 L",
  },
  waterPurifier: { ro: "RO", uvuf: "UV / UF", uv: "UV" },
  mixer: { basic: "Basic (500W class)", heavyDuty: "Heavy duty", commercial: "Commercial" },
  charging: { mobile: "Mobile charger", fastCharging: "Fast charger", laptop: "Laptop adapter" },
  iron: { dry: "Dry iron", steam: "Steam iron" },
  washingMachine: { semiAuto: "Semi-automatic", topLoad: "Top load", frontLoad: "Front load" },
  ac: { split1Ton: "Split 1 Ton", split1_5Ton: "Split 1.5 Ton", split2Ton: "Split 2 Ton", window1Ton: "Window 1 Ton" },
  pump: { small075hp: "0.75 HP", onehp: "1 HP", one5hp: "1.5 HP" },
  computer: { desktop: "Desktop PC", monitor24: "Monitor", wifiRouter: "Wi‑Fi router" },
  other: { misc50: "~50 W load", misc100: "~100 W load", misc200: "~200 W load" },
};

export function getApplianceWattage(category, type) {
  const cat = applianceConfig[category];
  if (!cat || type == null || type === "") return 0;
  const w = cat[type];
  return Number(w) || 0;
}

export function typeLabel(category, type) {
  const m = applianceTypeLabels[category];
  if (m && m[type]) return m[type];
  return String(type);
}

/**
 * @param {{ category: string, type: string, quantity: number }[]} appliances
 * @returns {{ lines: object[], totalWatts: number, warnings: string[] }}
 */
export function computeApplianceLoadLines(appliances) {
  const warnings = [];
  const lines = [];
  if (!Array.isArray(appliances)) return { lines, totalWatts: 0, warnings: ["No appliances array"] };

  for (const raw of appliances) {
    const qty = Math.max(0, Math.floor(Number(raw.quantity) || 0));
    const category = String(raw.category ?? "").trim();
    const type = String(raw.type ?? "").trim();
    if (!qty) continue;
    if (!category || !type) {
      warnings.push("Skipped row with missing category or type");
      continue;
    }
    const wattsEach = getApplianceWattage(category, type);
    if (!wattsEach) {
      warnings.push(`Unknown appliance: ${category} / ${type}`);
      continue;
    }
    const lineWatts = wattsEach * qty;
    lines.push({
      category,
      categoryLabel: applianceCategoryLabels[category] || category,
      type,
      typeLabel: typeLabel(category, type),
      quantity: qty,
      wattsEach,
      lineWatts,
    });
  }
  const totalWatts = lines.reduce((s, l) => s + l.lineWatts, 0);
  return { lines, totalWatts, warnings };
}

/** Dropdown metadata: category → types with watts */
export function getApplianceCategoryOptions() {
  return Object.keys(applianceConfig).map((key) => ({
    key,
    label: applianceCategoryLabels[key] || key,
    types: Object.keys(applianceConfig[key]).map((t) => ({
      key: t,
      label: `${typeLabel(key, t)} — ${applianceConfig[key][t]} W`,
      watts: applianceConfig[key][t],
    })),
  }));
}

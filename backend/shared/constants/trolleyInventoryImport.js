/** Luminous trolley Excel headers → internal keys. */
export const TROLLEY_COLUMN_MAP_ORDERED = [
  { key: "srNo", aliases: ["sr.no", "sr no", "srno", "s.no", "serial no"] },
  { key: "brand", aliases: ["brand", "make"] },
  {
    key: "model",
    aliases: [
      "trolley model number",
      "trolley model",
      "trolley name",
      "model number",
      "model no",
      "model",
      "sku",
      "part number",
    ],
  },
  {
    key: "compatibleVA",
    aliases: [
      "compatible va",
      "compatibility",
      "inverter va",
      "inv va",
      "va rating",
      "rated va",
      "capacity va",
    ],
  },
  {
    key: "productCapacity",
    aliases: ["product capacity (va)", "product capacity", "capacity (va)", "spec (va)", "compatible va"],
  },
  {
    key: "suitableBatteryType",
    aliases: [
      "suitable battery type",
      "battery type",
      "batt type",
      "description",
      "trolley type",
      "type",
      "specification",
    ],
  },
  { key: "dp", aliases: ["dp", "distributor price", "distributor purchase", "dealer price"] },
  { key: "cd", aliases: ["cd", "cash discount", "cash discount price", "cash price"] },
  {
    key: "price",
    aliases: ["price", "final price", "selling price", "customer price", "mrp", "max retail", "m.r.p"],
  },
  { key: "quantity", aliases: ["quantity", "qty", "stock"] },
  {
    key: "pl",
    aliases: ["p&l", "p & l", "pnl", "profit & loss", "profit and loss", "profit/loss", "p/l"],
  },
  { key: "notes", aliases: ["notes", "note", "remarks", "remark"] },
];

export const TROLLEY_INVENTORY_TABLE_GROUPS = [
  { id: "details", label: "Trolley Details", span: 5 },
  { id: "pricing", label: "Pricing", span: 3 },
  { id: "stock", label: "Stock", span: 3 },
];

export const TROLLEY_INVENTORY_TABLE_COLUMNS = [
  { key: "srNo", label: "SR.NO", group: "details" },
  { key: "brand", label: "Brand", group: "details" },
  { key: "model", label: "Trolley Model", group: "details" },
  { key: "productCapacity", label: "Compatibility", group: "details" },
  { key: "suitableBatteryType", label: "Suitable Battery Type", group: "details" },
  { key: "dp", label: "DP", format: "rupee", group: "pricing", align: "center" },
  { key: "cd", label: "CD", format: "rupee", group: "pricing", align: "center" },
  { key: "price", label: "Price", format: "rupee", group: "pricing", align: "center" },
  { key: "quantity", label: "Qty", format: "num", group: "stock", align: "center" },
  { key: "branchName", label: "Branch", group: "stock" },
  { key: "notes", label: "Notes", group: "stock" },
];

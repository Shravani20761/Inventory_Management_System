/**
 * Inverter-only inventory section: Excel headers → internal keys (order matters for findColumnKey).
 */
export const INVERTER_COLUMN_MAP_ORDERED = [
  { key: "srNo", aliases: ["sr.no", "sr no", "srno", "s.no", "serial no"] },
  { key: "brand", aliases: ["brand", "make"] },
  {
    key: "model",
    aliases: [
      "inverter model number",
      "inverter model no",
      "inverter model",
      "inv model",
      "model number",
      "model no",
      "model",
      "inverter name",
      "product description",
      "sku",
      "part number",
    ],
  },
  {
    key: "inverterVA",
    aliases: [
      "inverter va",
      "inv va",
      "inv.va",
      "inverter (va)",
      "va rating",
      "rated va",
      "capacity va",
    ],
  },
  {
    key: "productCapacity",
    aliases: [
      "product capacity (va)",
      "product capacity",
      "capacity (va)",
      "inverter (va)",
      "spec (va)",
      "rating (va)",
    ],
  },
  { key: "warranty", aliases: ["warranty", "waranty"] },
  { key: "dp", aliases: ["dp", "distributor price", "distributor purchase", "dealer price"] },
  { key: "cd", aliases: ["cd", "cash discount", "cash discount price", "cash price"] },
  {
    key: "mrp",
    aliases: [
      "mrp (inverter final price)",
      "inverter final price",
      "mrp",
      "max retail",
      "m.r.p",
      "final price",
    ],
  },
  {
    key: "sellRate",
    aliases: [
      "selling price",
      "sell price",
      "sell rate",
      "selling rate",
      "shop price",
      "retail selling price",
      "dealer selling price",
      "new rate with ob",
      "with ob",
    ],
  },
  { key: "amazonPrice", aliases: ["amazon price", "amazon"] },
  { key: "flipkartPrice", aliases: ["flipkart price", "flipkart"] },
  { key: "batteryBhaiPrice", aliases: ["batterybhai price", "battery bhai", "batterybhai"] },
  { key: "batteryBossPrice", aliases: ["batteryboss price", "battery boss", "batteryboss"] },
  { key: "quantity", aliases: ["quantity", "qty", "stock"] },
];

export const INVERTER_INVENTORY_TABLE_GROUPS = [
  { id: "details", label: "Inverter Details", span: 5 },
  { id: "pricing", label: "Pricing", span: 3 },
  { id: "selling", label: "Selling", span: 2 },
  { id: "stock", label: "Stock", span: 1 },
];

export const INVERTER_INVENTORY_TABLE_COLUMNS = [
  { key: "srNo", label: "SR.NO", group: "details" },
  { key: "brand", label: "Brand", group: "details" },
  { key: "model", label: "Inverter Model Number", group: "details" },
  { key: "productCapacity", label: "Product Capacity (VA)", group: "details" },
  { key: "warranty", label: "Warranty", group: "details" },
  { key: "dp", label: "DP", format: "rupee", group: "pricing", align: "center" },
  { key: "cd", label: "CD", format: "rupee", group: "pricing", align: "center" },
  { key: "mrp", label: "MRP", format: "rupee", group: "pricing", align: "center" },
  { key: "sellRate", label: "Selling Price", format: "rupee", group: "selling", align: "center" },
  { key: "pl", label: "P&L", group: "selling", align: "center" },
  { key: "quantity", label: "Qty", format: "num", group: "stock", align: "center" },
];

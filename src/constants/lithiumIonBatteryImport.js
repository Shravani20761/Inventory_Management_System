/**
 * Lithium-ion battery sheet — ERP layout aligned with Home Inverter Battery columns + Voltage (V).
 * DP and CD are required on upload and manual add.
 */
export const LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED = [
  { key: "srNo", aliases: ["sr.no", "sr no", "srno", "s.no", "serial no"] },
  { key: "brand", aliases: ["brand", "make"] },
  {
    key: "batteryModel",
    aliases: [
      "battery model number",
      "lithium model number",
      "battery model",
      "model number",
      "model no",
      "model",
      "sku",
      "part number",
    ],
  },
  {
    key: "batteryAH",
    aliases: [
      "product capacity (ah)",
      "product capacity ah",
      "capacity (ah)",
      "battery ah",
      "ah capacity",
      "nom ah",
      "ah",
      "capacity",
    ],
  },
  {
    key: "voltage",
    aliases: ["voltage (v)", "voltage", "volt", "nominal voltage", "battery voltage", "v"],
  },
  { key: "weight", aliases: ["battery weight", "weight", "wt"] },
  {
    key: "batteryType",
    aliases: ["battery type", "batt type", "cell type", "lithium type"],
  },
  { key: "warranty", aliases: ["warranty", "warranty period", "warranty (months)"] },
  { key: "cd", aliases: ["cd", "cash discount", "cash discount price", "dealer cd", "cash price"] },
  {
    key: "dp",
    aliases: ["dp", "distributor price", "distributor purchase", "dp + gst", "dp+gst", "dealer price"],
  },
  {
    key: "mrpFinal",
    aliases: ["mrp final", "mrp (final)", "final mrp", "mrp", "max retail", "m.r.p", "final price"],
  },
  { key: "scrapRate", aliases: ["scrap rate", "scrap"] },
  {
    key: "newRateWithOB",
    aliases: ["with old", "with old battery", "rate with old", "new rate with ob", "with ob"],
  },
  {
    key: "newRateWithoutOB",
    aliases: [
      "without old",
      "without old battery",
      "w/o old",
      "new rate w/o b",
      "w/o b",
      "without ob",
    ],
  },
  { key: "amazonPrice", aliases: ["amazon price", "amazon"] },
  { key: "flipkartPrice", aliases: ["flipkart price", "flipkart"] },
  { key: "batteryBhaiPrice", aliases: ["batterybhai price", "battery bhai", "batterybhai"] },
  { key: "batteryBossPrice", aliases: ["batteryboss price", "battery boss", "batteryboss"] },
  { key: "quantity", aliases: ["quantity", "qty", "stock"] },
  { key: "supplier", aliases: ["supplier", "vendor"] },
  { key: "invoiceNo", aliases: ["invoice no", "invoice number", "purchase invoice"] },
  { key: "notes", aliases: ["notes", "note", "remarks", "remark"] },
];

export const LITHIUM_ION_BATTERY_TABLE_GROUPS = [
  { id: "spec", label: "Specifications", span: 7 },
  { id: "warranty", label: "Warranty", span: 1 },
  { id: "pricing", label: "Pricing", span: 4 },
  { id: "exchange", label: "Exchange", span: 2 },
  { id: "stock", label: "Stock", span: 2 },
];

export const LITHIUM_ION_BATTERY_TABLE_COLUMNS = [
  { key: "srNo", label: "SR.NO", group: "spec" },
  { key: "brand", label: "Brand", group: "spec" },
  { key: "batteryModel", label: "Battery Model Number", group: "spec" },
  { key: "batteryAH", label: "Product Capacity (AH)", format: "num", group: "spec", align: "center" },
  { key: "voltage", label: "Voltage (V)", format: "num", group: "spec", align: "center" },
  { key: "weight", label: "Battery Weight", format: "num", group: "spec", align: "center" },
  { key: "batteryType", label: "Battery Type", group: "spec" },
  { key: "warranty", label: "Warranty", group: "warranty" },
  { key: "cd", label: "CD", format: "rupee", group: "pricing", align: "center", required: true },
  { key: "dp", label: "DP", format: "rupee", group: "pricing", align: "center", required: true },
  { key: "mrpFinal", label: "MRP FINAL", format: "rupee", group: "pricing", align: "center" },
  { key: "scrapRate", label: "Scrap Rate", format: "rupee", group: "pricing", align: "center" },
  { key: "newRateWithOB", label: "WITH OLD", format: "rupee", group: "exchange", align: "center" },
  { key: "newRateWithoutOB", label: "WITHOUT OLD", format: "rupee", group: "exchange", align: "center" },
  { key: "quantity", label: "Qty", format: "num", group: "stock", align: "center" },
  { key: "branchName", label: "Branch", group: "stock" },
];

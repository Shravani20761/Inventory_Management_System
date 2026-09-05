/**

 * Home / backup battery sheet: Excel headers → internal keys (order matters for findColumnKey).

 * Stored row `type` is `HOME_INVERTER_BATTERY_TYPE` from `inventoryTypes.js`.

 */

export const HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED = [

  { key: "srNo", aliases: ["sr.no", "sr no", "srno", "s.no", "serial no"] },

  { key: "brand", aliases: ["brand", "manufacturer", "make", "company", "company name", "brand name"] },

  {
    key: "modelType",
    label: "Model Type",
    aliases: ["model type", "modeltype"],
  },

  {

    key: "batteryModel",

    aliases: [

      "battery model number",

      "battery model",

      "batt model",

      "battery name",

      "model number",

      "model",

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

    ],

  },

  { key: "weight", aliases: ["battery weight", "weight", "wt"] },

  { key: "batteryType", aliases: ["type", "battery type", "product type", "batt type", "cell type"] },

  { key: "warranty", aliases: ["warranty", "waranty"] },

  { key: "cd", aliases: ["cd", "cash discount", "cash discount price", "dealer cd"] },

  {

    key: "dp",

    aliases: ["dp", "distributor price", "distributor purchase", "dp + gst", "dp+gst", "d.p. + gst", "dealer price"],

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

  {
    key: "pl",
    aliases: ["p&l", "p & l", "pnl", "profit & loss", "profit and loss", "profit/loss", "p/l"],
  },

];



/** ERP battery inventory table — pricing-oriented layout. */

export const HOME_INVERTER_BATTERY_TABLE_COLUMNS = [

  { key: "srNo", label: "SR.NO", group: "spec" },

  { key: "brand", label: "Brand", group: "spec" },

  { key: "batteryModel", label: "Battery Model Number", group: "spec" },

  { key: "batteryAH", label: "Product Capacity (AH)", format: "num", group: "spec", align: "center" },

  { key: "weight", label: "Battery Weight", format: "num", group: "spec", align: "center" },

  { key: "modelType", label: "Model Type", group: "spec" },

  { key: "batteryType", label: "Battery Type", group: "spec" },

  { key: "warranty", label: "Warranty", group: "warranty" },

  { key: "cd", label: "CD", format: "rupee", group: "pricing", align: "center" },

  { key: "dp", label: "DP", format: "rupee", group: "pricing", align: "center" },

  { key: "mrpFinal", label: "MRP FINAL", format: "rupee", group: "pricing", align: "center" },

  { key: "scrapRate", label: "Scrap Rate", format: "rupee", group: "pricing", align: "center" },

  { key: "newRateWithOB", label: "WITH OLD", format: "rupee", group: "exchange", align: "center" },

  { key: "newRateWithoutOB", label: "WITHOUT OLD", format: "rupee", group: "exchange", align: "center" },

  { key: "quantity", label: "Qty", format: "num", group: "qty", align: "center" },

];



export const HOME_INVERTER_BATTERY_TABLE_GROUPS = [

  { id: "spec", label: "Specifications", span: 7 },

  { id: "warranty", label: "Warranty", span: 1 },

  { id: "pricing", label: "Pricing", span: 4 },

  { id: "exchange", label: "Exchange", span: 2 },

  { id: "qty", label: "Stock", span: 1 },

];



/**
 * Runs the same Excel logic as the shop UI ({@link ../shared/utils/excelParser.js})
 * on a server-side buffer (multer memory upload).
 */
import { parseBatteryExcelFile } from "../shared/utils/excelParser.js";

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {{ importType?: string }} [options] Inventory section tab: "Car", "Inverter+Battery", etc.
 */
export async function parseInventoryExcelBuffer(buffer, options = {}) {
  const u8 = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const ab = u8.slice().buffer;
  const fakeFile = {
    size: u8.byteLength,
    name: "inventory-upload.xlsx",
    arrayBuffer: async () => ab,
  };
  return parseBatteryExcelFile(fakeFile, options);
}

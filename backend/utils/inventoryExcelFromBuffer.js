/**
 * Runs the same Excel logic as the shop UI ({@link ../shared/utils/excelParser.js})
 * on a server-side buffer (multer memory upload).
 */
import { parseBatteryExcelFile } from "../shared/utils/excelParser.js";
import {
  analyzeInventoryExcelUpload,
  parseInventoryExcelWithMapping,
  validateImportColumnMapping,
} from "./inventoryImportPreview.js";

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {{ importType?: string, columnMappingByIndex?: Record<string,string>, duplicateSelections?: Record<string,number> }} [options]
 */
export async function parseInventoryExcelBuffer(buffer, options = {}) {
  const u8 = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const ab = u8.slice().buffer;
  const fakeFile = {
    size: u8.byteLength,
    name: "inventory-upload.xlsx",
    arrayBuffer: async () => ab,
  };

  if (options.columnMappingByIndex && Object.keys(options.columnMappingByIndex).length) {
    return parseInventoryExcelWithMapping(buffer, options.importType, {
      columnMappingByIndex: options.columnMappingByIndex,
      duplicateSelections: options.duplicateSelections,
      fileName: "inventory-upload.xlsx",
    });
  }

  return parseBatteryExcelFile(fakeFile, options);
}

export { analyzeInventoryExcelUpload, validateImportColumnMapping };

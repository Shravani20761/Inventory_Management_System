/**
 * Appliance-driven combo preview — delegates to combo mode router (dynamic or predefined).
 */
export async function previewComboFromApplianceRequirements(requirements = {}, context = {}) {
  const { previewComboFromComboInventory } = await import("./comboRowQuotationService.js");
  return previewComboFromComboInventory(requirements, context);
}

export { previewDynamicComboQuotation } from "./dynamicInvBatRecommendationService.js";
export { previewPredefinedComboQuotation } from "./predefinedComboRecommendationService.js";

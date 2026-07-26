/**
 * Server entry: re-exports shared image mapping + PDF/UI badge colors for quotation templates.
 */
export * from "../shared/productImages.js";

export const BADGE_COLORS = {
  Budget: { bg: "#059669", text: "#fff", label: "Budget" },
  Recommended: { bg: "#2563eb", text: "#fff", label: "Recommended" },
  Premium: { bg: "#6B21D8", text: "#fff", label: "Premium" },
  "Heavy Load": { bg: "#ea580c", text: "#fff", label: "Heavy Load" },
  "Long Backup": { bg: "#0891b2", text: "#fff", label: "Long Backup" },
  "Best Value": { bg: "#059669", text: "#fff", label: "Best Value" },
  "Premium Choice": { bg: "#6B21D8", text: "#fff", label: "Premium Choice" },
};

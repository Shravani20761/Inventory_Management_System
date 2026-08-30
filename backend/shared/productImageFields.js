/** SKU image slots used in inventory UI (B/F frames) and quotation PDFs. */
export const PRODUCT_IMAGE_FIELDS = ["batteryImage", "inverterImage", "brandLogo"];

export const PRODUCT_IMAGE_LABELS = {
  batteryImage: "Battery image",
  inverterImage: "Inverter image",
  brandLogo: "Brand image",
};

export function resolveStoredImageUrl(doc, field) {
  if (!doc) return "";
  if (field === "inverterImage") return String(doc.inverterImage || doc.image || "").trim();
  if (field === "brandLogo") return String(doc.brandLogo || doc.brandDefaultImage || "").trim();
  if (field === "batteryImage") return String(doc.batteryImage || doc.imageUrl || "").trim();
  return String(doc[field] || "").trim();
}

export function imageFieldSetPayload(field, url) {
  const value = String(url || "").trim();
  const set = { [field]: value };
  if (field === "inverterImage") set.image = value;
  if (field === "brandLogo") set.brandDefaultImage = value;
  if (field === "batteryImage") set.imageUrl = value;
  return set;
}

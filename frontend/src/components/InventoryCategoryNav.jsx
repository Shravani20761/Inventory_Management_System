import { INVENTORY_CATEGORIES, automotiveBrandDisplayLabel } from "../constants/inventoryCategories.js";

/**
 * Category tabs + brand subcategory chips for ERP-style inventory navigation.
 */
export function InventoryCategoryNav({ categoryId, brandFilter, onCategoryChange, onBrandChange, brandCounts = [] }) {
  const category = INVENTORY_CATEGORIES.find((c) => c.id === categoryId) ?? INVENTORY_CATEGORIES[0];
  const showBrands = Array.isArray(category.brands) && category.brands.length > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showBrands ? 12 : 0 }}>
        {INVENTORY_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`btn btn-sm ${categoryId === cat.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => onCategoryChange(cat.id)}
            style={{ fontWeight: categoryId === cat.id ? 700 : 500 }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {showBrands && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "10px 12px",
            background: "#f9fafb",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", alignSelf: "center", marginRight: 4 }}>
            {category.label} ·
          </span>
          {brandCounts.map(({ brand, count, isOther }) => (
            <button
              key={brand}
              type="button"
              onClick={() => onBrandChange(brand)}
              style={{
                border: brandFilter === brand ? "2px solid #2563eb" : "1px solid #d1d5db",
                background: brandFilter === brand ? "#eff6ff" : "#fff",
                color: brandFilter === brand ? "#1d4ed8" : "#374151",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 15,
                fontWeight: brandFilter === brand ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {automotiveBrandDisplayLabel(category, brand, { isOther })}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 14,
                  color: brandFilter === brand ? "#1d4ed8" : "#6b7280",
                  fontWeight: 600,
                }}
              >
                ({count})
              </span>
            </button>
          ))}
        </div>
      )}

      {category.id === "combo" && (
        <div style={{ fontSize: 15, color: "#6b7280", marginTop: 8 }}>
          Combo inventory is unified — no brand sub-sections (dynamic pairing in quotations).
        </div>
      )}
    </div>
  );
}

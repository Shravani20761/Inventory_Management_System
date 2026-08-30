import { INVENTORY_CATEGORIES, automotiveBrandDisplayLabel } from "../constants/inventoryCategories.js";

/**
 * Category tabs + brand subcategory chips for ERP-style inventory navigation.
 */
export function InventoryCategoryNav({ categoryId, brandFilter, onCategoryChange, onBrandChange, brandCounts = [] }) {
  const category = INVENTORY_CATEGORIES.find((c) => c.id === categoryId) ?? INVENTORY_CATEGORIES[0];
  const showBrands = Array.isArray(category.brands) && category.brands.length > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="inv-category-tabs" style={{ marginBottom: showBrands ? 12 : 0 }}>
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
        <div className="inv-brand-row">
          <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", alignSelf: "center", marginRight: 4 }}>
            {category.label} ·
          </span>
          <button
            type="button"
            className={`inv-brand-chip${!brandFilter || brandFilter === "All" ? " active" : ""}`}
            onClick={() => onBrandChange("All")}
          >
            All
            <span className="count">({brandCounts.reduce((s, b) => s + (b.count ?? 0), 0)})</span>
          </button>
          {brandCounts.map(({ brand, count, isOther }) => (
            <button
              key={brand}
              type="button"
              className={`inv-brand-chip${brandFilter === brand ? " active" : ""}`}
              onClick={() => onBrandChange(brand)}
            >
              {automotiveBrandDisplayLabel(category, brand, { isOther })}
              <span className="count">({count})</span>
            </button>
          ))}
        </div>
      )}

      {category.id === "combo" && (
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
          Combo inventory is unified — no brand sub-sections (dynamic pairing in quotations).
        </div>
      )}
    </div>
  );
}

/** Dev: call Express directly (avoids Vite proxy ECONNRESET on large uploads). Prod: use /api or VITE_API_URL. */
function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_URL ?? "").trim();
  if (configured && configured !== "/api") {
    return configured.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    const direct = String(import.meta.env.VITE_API_DIRECT ?? "http://127.0.0.1:3001/api").trim();
    return direct.replace(/\/$/, "");
  }
  return "/api";
}

const API_BASE = resolveApiBase();
const TOKEN_KEY = "batterypro_token";
const USER_KEY = "batterypro_user";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientNetworkError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("networkerror") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("cannot reach api") ||
    msg.includes("bad gateway") ||
    msg.includes("not responding")
  );
}

/** Wait until GET /health succeeds (API restarts during node --watch). */
async function waitForApiReady(maxWaitMs = 20000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(600);
  }
  return false;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** Attach auth + HQ branch act-as headers to any fetch. */
export function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const actAs = localStorage.getItem("batterypro_act_as_branch");
    if (actAs) headers["X-Branch-Id"] = actAs;
  } catch {
    /* ignore */
  }
  return headers;
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // HQ Admin act-as branch (managers ignore this server-side)
  try {
    const actAs = localStorage.getItem("batterypro_act_as_branch");
    if (actAs) headers["X-Branch-Id"] = actAs;
  } catch {
    /* ignore */
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch (e) {
    const wrapped = new Error(
      "Cannot reach API server. Run: npm run dev (starts API on port 3001 + frontend). " + (e.message || ""),
      { cause: e },
    );
    throw wrapped;
  }

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    let msg = err.error || res.statusText || "Request failed";
    // Express default 404 has empty body → statusText "Not Found"
    if (res.status === 404 && (!err.error || err.error === "Not Found") && String(path).startsWith("/branches")) {
      msg =
        "Branch API route not found on the server (PATCH /api/branches/:id). Restart the backend (npm run dev) so the latest branches routes are loaded.";
    }
    if (res.status === 502 || res.status === 503) {
      throw new Error(
        "API server not responding (Bad Gateway). Stop all terminals, then run: npm run dev — wait until you see 'BatteryPro API running at http://localhost:3001'."
      );
    }
    const e = new Error(msg, { cause: err });
    e.body = err;
    if (err.details) e.details = err.details;
    else if (err.duplicate) e.details = err;
    throw e;
  }
  return res.json();
}

export const api = {
  health: () => request("/health"),

  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  profile: () => request("/auth/profile"),

  getAll: () => request("/sync/all"),
  saveAll: (data) => request("/sync/all", { method: "PUT", body: JSON.stringify(data) }),

  inventory: {
    list: () => request("/inventory"),
    stats: () => request("/inventory/stats"),
    create: (item) => request("/inventory", { method: "POST", body: JSON.stringify(item) }),
    update: (id, item) => request(`/inventory/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    remove: (id) => request(`/inventory/${id}`, { method: "DELETE" }),
    bulk: (items) => request("/inventory/bulk", { method: "POST", body: JSON.stringify({ items }) }),
  },

  products: {
    list: () => request("/products"),
    get: (id) => request(`/products/${id}`),
    create: (item) => request("/products", { method: "POST", body: JSON.stringify(item) }),
    update: (id, item) => request(`/products/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    remove: (id) => request(`/products/${id}`, { method: "DELETE" }),
    bulk: (items) => request("/products/bulk", { method: "POST", body: JSON.stringify({ items }) }),
  },

  purchases: {
    list: () => request("/purchases"),
    create: (record) => request("/purchases", { method: "POST", body: JSON.stringify(record) }),
    update: (id, record) => request(`/purchases/${id}`, { method: "PUT", body: JSON.stringify(record) }),
    remove: (id) => request(`/purchases/${id}`, { method: "DELETE" }),
  },

  purchaseManagement: {
    list: (params = {}) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== "")),
      ).toString();
      return request(`/purchase-management${qs ? `?${qs}` : ""}`);
    },
    get: (id) => request(`/purchase-management/${encodeURIComponent(id)}`),
    create: (payload) =>
      request("/purchase-management", { method: "POST", body: JSON.stringify(payload) }),
    addPayment: (id, payload) =>
      request(`/purchase-management/${encodeURIComponent(id)}/payments`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateCheque: (id, chequeId, status) =>
      request(`/purchase-management/${encodeURIComponent(id)}/cheques/${chequeId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    dashboard: () => request("/purchase-management/dashboard"),
    outstandingReport: () => request("/purchase-management/reports/outstanding"),
    monthlyReport: (month) =>
      request(`/purchase-management/reports/monthly${month ? `?month=${encodeURIComponent(month)}` : ""}`),
    vendorLedger: (vendorName) =>
      request(`/purchase-management/reports/vendor/${encodeURIComponent(vendorName)}`),
    runReminders: (dryRun = false) =>
      request(`/purchase-management/reminders/run${dryRun ? "?dryRun=true" : ""}`, { method: "GET" }),
  },

  sales: {
    list: () => request("/sales"),
    create: (record) => request("/sales", { method: "POST", body: JSON.stringify(record) }),
    update: (id, record) => request(`/sales/${id}`, { method: "PUT", body: JSON.stringify(record) }),
    remove: (id) => request(`/sales/${id}`, { method: "DELETE" }),
  },

  quotations: {
    list: () => request("/quotations"),
    deleteAll: () => request("/quotations", { method: "DELETE" }),
    create: (record) => request("/quotations", { method: "POST", body: JSON.stringify(record) }),
    update: (id, record) => request(`/quotations/${id}`, { method: "PUT", body: JSON.stringify(record) }),
    setStatus: (id, status) =>
      request(`/quotations/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
  },

  invoices: {
    list: () => request("/invoices"),
    create: (record) => request("/invoices", { method: "POST", body: JSON.stringify(record) }),
    update: (id, record) => request(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(record) }),
  },

  accounts: {
    _qs: (params = {}) =>
      new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== "")),
      ).toString(),
    dashboard(params) { return request(`/accounts/dashboard?${this._qs(params)}`); },
    salesReport(params) { return request(`/accounts/reports/sales?${this._qs(params)}`); },
    purchaseReport(params) { return request(`/accounts/reports/purchase?${this._qs(params)}`); },
    expenseReport(params) { return request(`/accounts/reports/expense?${this._qs(params)}`); },
    inventoryReport(params) { return request(`/accounts/reports/inventory?${this._qs(params)}`); },
    gstReport(params) { return request(`/accounts/reports/gst?${this._qs(params)}`); },
    profitLossReport(params) { return request(`/accounts/reports/profit-loss?${this._qs(params)}`); },
    listExpenses(category) { return request(`/accounts/expenses${category ? `?category=${encodeURIComponent(category)}` : ""}`); },
    createExpense(payload) { return request("/accounts/expenses", { method: "POST", body: JSON.stringify(payload) }); },
    deleteExpense(id) { return request(`/accounts/expenses/${encodeURIComponent(id)}`, { method: "DELETE" }); },
    getCaProfile() { return request("/accounts/ca-profile"); },
    saveCaProfile(payload) { return request("/accounts/ca-profile", { method: "PUT", body: JSON.stringify(payload) }); },
    generateReport(type, params) { return request(`/accounts/generate/${encodeURIComponent(type)}?${this._qs(params)}`, { method: "POST" }); },
    generatePackage(params) { return request(`/accounts/generate/package?${this._qs(params)}`, { method: "POST" }); },
    deliveryStatus() { return request("/accounts/delivery/status"); },
    emailToCa(payload) { return request("/accounts/send/email", { method: "POST", body: JSON.stringify(payload) }); },
    whatsappToCa(payload) { return request("/accounts/send/whatsapp", { method: "POST", body: JSON.stringify(payload) }); },
  },

  vehicles: {
    brands: ({ vehicleType, q = "" }) => {
      const p = new URLSearchParams({ vehicleType, q });
      return request(`/vehicles/brands?${p}`);
    },
    models: ({ vehicleType, brand, q = "" }) => {
      const p = new URLSearchParams({ vehicleType, brand, q });
      return request(`/vehicles/models?${p}`);
    },
    fuels: ({ vehicleType, brand, model }) => {
      const p = new URLSearchParams({ vehicleType, brand, model });
      return request(`/vehicles/fuels?${p}`);
    },
    compatibleBatteries: ({ vehicleType, brand, model, fuelType = "" }) => {
      const p = new URLSearchParams({ vehicleType, brand, model, fuelType });
      return request(`/vehicles/compatible-batteries?${p}`);
    },
    catalog: {
      types: () => request("/vehicles/catalog/types"),
      brands: ({ vehicleTypeId, q = "" }) =>
        request(`/vehicles/catalog/brands?${new URLSearchParams({ vehicleTypeId, q })}`),
      models: ({ brandId, q = "" }) =>
        request(`/vehicles/catalog/models?${new URLSearchParams({ brandId, q })}`),
      variants: ({ modelId }) => request(`/vehicles/catalog/variants?modelId=${encodeURIComponent(modelId)}`),
      fuels: ({ modelId }) => request(`/vehicles/catalog/fuel-types?modelId=${encodeURIComponent(modelId)}`),
      years: ({ variantId }) => request(`/vehicles/catalog/years?variantId=${encodeURIComponent(variantId)}`),
      recommend: ({ variantId, includeOutOfStock = false, year = "" }) => {
        const p = new URLSearchParams({ variantId });
        if (includeOutOfStock) p.set("includeOutOfStock", "true");
        if (year) p.set("year", String(year));
        return request(`/vehicles/catalog/recommend?${p}`);
      },
    },
    admin: {
      vehicles: (params = {}) => {
        const qs = new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== "")),
        ).toString();
        return request(`/vehicles/admin/vehicles${qs ? `?${qs}` : ""}`);
      },
      createVehicle: (payload) => request("/vehicles/admin/vehicles", { method: "POST", body: JSON.stringify(payload) }),
      updateVehicle: (id, payload) =>
        request(`/vehicles/admin/vehicles/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
      deleteVehicle: (id) => request(`/vehicles/admin/vehicles/${encodeURIComponent(id)}`, { method: "DELETE" }),
      duplicateVehicle: (id) =>
        request(`/vehicles/admin/vehicles/${encodeURIComponent(id)}/duplicate`, { method: "POST", body: "{}" }),
      fitmentGroups: () => request("/vehicles/admin/fitment-groups"),
      createFitment: (payload) =>
        request("/vehicles/admin/fitment-groups", { method: "POST", body: JSON.stringify(payload) }),
      updateFitment: (id, payload) =>
        request(`/vehicles/admin/fitment-groups/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
      deleteFitment: (id) => request(`/vehicles/admin/fitment-groups/${encodeURIComponent(id)}`, { method: "DELETE" }),
      importFitments: async (file) => {
        const form = new FormData();
        form.append("file", file);
        const token = getToken();
        const res = await fetch(`${API_BASE}/vehicles/admin/import`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Import failed");
        }
        return res.json();
      },
      downloadTemplate: async () => {
        const token = getToken();
        const res = await fetch(`${API_BASE}/vehicles/admin/import-template`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Template download failed");
        const text = await res.text();
        const blob = new Blob([text], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "vehicle-fitment-template.csv";
        a.click();
      },
    },
  },

  previewQuotationOptions: async (requirements) => {
    const body = JSON.stringify(requirements);
    const paths = ["/quotations/preview-options", "/preview-quotation-options"];
    let lastErr;
    for (const p of paths) {
      try {
        return await request(p, { method: "POST", body });
      } catch (e) {
        lastErr = e;
        if (!e.message?.includes("Bad Gateway") && !e.message?.includes("Cannot reach")) throw e;
      }
    }
    throw lastErr;
  },

  generateQuotation: (requirements) =>
    request("/generate-quotation", { method: "POST", body: JSON.stringify(requirements) }),

  saveRecommendationSheet: (payload) =>
    request("/recommendations", { method: "POST", body: JSON.stringify(payload) }),

  listRecommendations: () => request("/recommendations"),

  finalizeQuotation: (payload) =>
    request("/recommendations/finalize-quotation", { method: "POST", body: JSON.stringify(payload) }),

  createQuotationFromSheet: (payload) =>
    request("/recommendations/finalize-quotation", { method: "POST", body: JSON.stringify(payload) }),

  updateQuotation: ({ id, ...body }) =>
    request(`/quotations/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),

  generateFinalQuotationPdf: (id, body = {}) =>
    request(`/quotations/${encodeURIComponent(id)}/generate-pdf`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  sendFinalQuotationWhatsApp: (id, body = {}) =>
    request(`/quotations/${encodeURIComponent(id)}/whatsapp`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  approveAndSendFinalQuotationWhatsApp: (id, body = {}) =>
    request(`/quotations/${encodeURIComponent(id)}/approve-send-whatsapp`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  listFinalQuotations: () => request("/quotations"),

  setQuotationStatus: (id, status) =>
    request(`/quotations/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  generateInvoice: (invoice) =>
    request("/generate-invoice", { method: "POST", body: JSON.stringify(invoice) }),

  prepareInvoiceFromQuotation: (quotation, selectedOption) =>
    request("/invoices/prepare-from-quotation", {
      method: "POST",
      body: JSON.stringify({ quotation, selectedOption }),
    }),

  recommendCombo: (requirements) =>
    request("/recommend-combo", { method: "POST", body: JSON.stringify(requirements) }),

  reports: {
    profitLoss: () => request("/reports/profit-loss"),
    lowStock: () => request("/reports/low-stock"),
    salesSummary: () => request("/reports/sales-summary"),
  },

  documents: {
    quotationPdf: (id) => request(`/documents/quotations/${id}/pdf`, { method: "POST" }),
    sendQuotationWhatsApp: (id) => request(`/documents/quotations/${id}/whatsapp`, { method: "POST" }),
  },

  uploadExcel: async (file, options = {}) => {
    const preview = options.preview === true;
    const form = new FormData();
    if (options.importType != null && String(options.importType).trim() !== "") {
      form.append("importType", String(options.importType).trim());
    }
    form.append("file", file);
    const p = preview ? "/upload/excel/preview" : "/upload/excel";
    const token = getToken();
    const res = await fetch(`${API_BASE}${p}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Upload failed");
    }
    return res.json();
  },

  /** Category-scoped inventory API paths (list + create). */
  inventoryCategoryPath: (section) => {
    const map = {
      Car: "/car-batteries",
      Truck: "/truck-batteries",
      Bike: "/bike-batteries",
      Inverter: "/inverters",
      "Inverter+Battery": "/inv-combos",
      "Home Inverter Battery": "/home-inv-battery",
      Trolley: "/trolleys",
      "Lithium Ion Battery": "/lithium-ion-batteries",
    };
    return map[section] || null;
  },

  listInventoryCategory: (section, { bustCache = false } = {}) => {
    const path = api.inventoryCategoryPath(section);
    if (!path) throw new Error(`No category list route for "${section}".`);
    const qs = bustCache ? `?_=${Date.now()}` : "";
    return request(`${path}${qs}`);
  },

  createInventoryCategory: (section, payload) => {
    const path = api.inventoryCategoryPath(section);
    if (!path) throw new Error(`No category create route for "${section}".`);
    return request(path, { method: "POST", body: JSON.stringify(payload) });
  },

  previewInventoryCategoryUpload: async (section, file, { columnMapping } = {}) => {
    if (!file) throw new Error("No file selected");
    const base = api.inventoryCategoryPath(section);
    if (!base) throw new Error(`No category preview route for "${section}".`);
    const form = new FormData();
    form.append("file", file);
    if (columnMapping && Object.keys(columnMapping).length) {
      form.append("columnMapping", JSON.stringify(columnMapping));
    }
    const token = getToken();
    const res = await fetch(`${API_BASE}${base}/upload/preview`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Preview failed");
    }
    return res.json();
  },

  uploadInventoryCategory: async (section, file, { defaultBrand, columnMapping, duplicateSelections } = {}) => {
    if (!file) throw new Error("No file selected");
    const base = api.inventoryCategoryPath(section);
    const path = base ? `${base}/upload` : null;
    if (!path) {
      throw new Error(`No category upload route for "${section}". Pick a product tab first.`);
    }
    const token = getToken();
    const maxAttempts = 5;
    let lastErr;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const ready = await waitForApiReady(20000);
        if (!ready) {
          lastErr = new Error("API server is restarting — wait a moment and try again.");
          break;
        }
        await sleep(400 * attempt);
      }

      const form = new FormData();
      form.append("file", file);
      if (defaultBrand) form.append("defaultBrand", defaultBrand);
      if (columnMapping && Object.keys(columnMapping).length) {
        form.append("columnMapping", JSON.stringify(columnMapping));
      }
      if (duplicateSelections && Object.keys(duplicateSelections).length) {
        form.append("duplicateSelections", JSON.stringify(duplicateSelections));
      }

      try {
        const res = await fetch(`${API_BASE}${path}`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        });
        if (res.status === 401) {
          clearSession();
          window.dispatchEvent(new CustomEvent("auth:logout"));
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Upload failed");
        }
        return res.json();
      } catch (e) {
        lastErr = e;
        if (!isTransientNetworkError(e) || attempt >= maxAttempts - 1) break;
        console.warn(`[upload] attempt ${attempt + 1} failed (${e.message}), retrying…`);
      }
    }

    throw new Error(
      lastErr?.message?.includes("Upload failed")
        ? lastErr.message
        : `Upload could not reach the API (${lastErr?.message || "network error"}). ` +
            "Ensure npm run dev is running and the API shows port 3001, then try again.",
      { cause: lastErr },
    );
  },

  /**
   * Upload a combo row image to Cloudinary; server saves the HTTPS URL on `inv_battery_combos`.
   * @param {string} mongoId - MongoDB `_id` of the combo document (24-char hex).
   * @param {File} file
   * @param {"inverterImage"|"batteryImage"|"brandLogo"} imageField
   */
  uploadInvComboImage: async (mongoId, file, imageField = "inverterImage") => {
    if (!mongoId || !file) throw new Error("Combo id and image file are required");
    const field = String(imageField).trim();
    if (!["inverterImage", "batteryImage", "brandLogo"].includes(field)) {
      throw new Error("imageField must be inverterImage, batteryImage, or brandLogo");
    }
    const form = new FormData();
    form.append("file", file);
    form.append("imageField", field);
    const token = getToken();
    const res = await fetch(`${API_BASE}/inv-combos/${encodeURIComponent(String(mongoId))}/upload-image`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Image upload failed");
    }
    return res.json();
  },

  uploadProductImage: async (mongoId, file, imageField = "batteryImage") => {
    if (!mongoId || !file) throw new Error("Product id and image file are required");
    const form = new FormData();
    form.append("file", file);
    form.append("imageField", imageField);
    const token = getToken();
    const res = await fetch(`${API_BASE}/inventory/${encodeURIComponent(String(mongoId))}/upload-image`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Image upload failed");
    }
    return res.json();
  },

  removeProductImage: (mongoId, field) =>
    request(`/inventory/${encodeURIComponent(String(mongoId))}/images/${encodeURIComponent(field)}`, {
      method: "DELETE",
    }),

  stockHistory: (mongoId) => request(`/inventory/${encodeURIComponent(String(mongoId))}/stock-history`),

  purchaseBills: {
    list: (params = {}) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== "")),
      ).toString();
      return request(`/purchase-bills${qs ? `?${qs}` : ""}`);
    },
    get: (id) => request(`/purchase-bills/${encodeURIComponent(id)}`),
    save: (id, payload) =>
      request(`/purchase-bills/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
    confirm: (id, payload = {}) =>
      request(`/purchase-bills/${encodeURIComponent(id)}/confirm`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    manual: (payload) => request("/purchase-bills/manual", { method: "POST", body: JSON.stringify(payload) }),
    upload: async (file) => {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/purchase-bills/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (res.status === 401) {
        clearSession();
        window.dispatchEvent(new CustomEvent("auth:logout"));
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    retryOcr: async (id, file) => {
      const form = new FormData();
      if (file) form.append("file", file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/purchase-bills/${encodeURIComponent(id)}/retry-ocr`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Retry OCR failed");
      }
      return res.json();
    },
  },

  branches: {
    /** Admin / RBAC branch entity list (with businessName). */
    list: () => request("/branches"),
    get: (id) => request(`/branches/${encodeURIComponent(id)}`),
    create: (body) => request("/branches", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/branches/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    deactivate: (id) => request(`/branches/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Legacy alias used by stock transfer UI */
    forTransfers: () => request("/stock-transfers/branches"),
  },

  users: {
    list: () => request("/users"),
    create: (body) => request("/users", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    resetPassword: (id, password) =>
      request(`/users/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
  },

  analytics: {
    get: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/analytics${qs ? `?${qs}` : ""}`);
    },
    auditLogs: (params = {}) => {
      const q = new URLSearchParams(params);
      return request(`/analytics/audit-logs?${q}`);
    },
  },

  stockTransfers: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      if (params.direction) q.set("direction", params.direction);
      if (params.status) q.set("status", params.status);
      const qs = q.toString();
      return request(`/stock-transfers${qs ? `?${qs}` : ""}`);
    },
    create: (payload) => request("/stock-transfers", { method: "POST", body: JSON.stringify(payload) }),
    action: (id, action, body = {}) =>
      request(`/stock-transfers/${encodeURIComponent(id)}/action`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      }),
    branchDashboard: () => request("/stock-transfers/branch-dashboard"),
  },

  inventorySearch: {
    search: (type, params = {}) => {
      const endpoint = String(type || "").replace(/^\/+/, "");
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/inventory/search/${endpoint}${qs ? `?${qs}` : ""}`);
    },
    battery: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/inventory/search/battery${qs ? `?${qs}` : ""}`);
    },
    inverter: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/inventory/search/inverter${qs ? `?${qs}` : ""}`);
    },
    carBattery: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/inventory/search/car-battery${qs ? `?${qs}` : ""}`);
    },
    bikeBattery: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/inventory/search/bike-battery${qs ? `?${qs}` : ""}`);
    },
    combo: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request(`/inventory/search/combo${qs ? `?${qs}` : ""}`);
    },
  },

  /** @deprecated Use api.inventorySearch.search(type, params) */
  searchGlobalInventory: (params = {}) => {
    const type = params.inventoryType || params.type || "battery";
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== "") q.set(k, String(v));
    });
    const qs = q.toString();
    return request(`/inventory/search/${type}${qs ? `?${qs}` : ""}`);
  },

  /** @deprecated Use api.inventorySearch */
  multiBranchStock: (params = {}) => api.inventorySearch.search(params.type || "battery", params),
};

export async function loadFromApi() {
  return api.getAll();
}

export async function isApiAvailable() {
  try {
    const h = await api.health();
    return h?.ok === true && h?.database === "mongodb";
  } catch {
    return false;
  }
}

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

export default api;

export const productsApi = {
  list: () => api.get("/products").then((r) => r.data),
  create: (data) => api.post("/products", data).then((r) => r.data),
  update: (id, data) => api.put(`/products/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
  bulk: (items) => api.post("/products/bulk", { items }).then((r) => r.data),
};

export const quotationsApi = {
  list: () => api.get("/quotations").then((r) => r.data),
  previewOptions: (requirements) => api.post("/quotations/preview-options", requirements).then((r) => r.data),
  generate: (payload) => api.post("/generate-quotation", payload).then((r) => r.data),
};

export const invoicesApi = {
  list: () => api.get("/invoices").then((r) => r.data),
  generate: (payload) => api.post("/generate-invoice", payload).then((r) => r.data),
};

export const combosApi = {
  recommend: (requirements) => api.post("/recommend-combo", requirements).then((r) => r.data),
};

export const healthApi = {
  check: () => api.get("/health").then((r) => r.data),
};

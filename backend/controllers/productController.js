import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  mergeProducts,
  updateProduct,
  countProductsInBranch,
  resolveTenantBranchId,
} from "../services/inventoryService.js";

function tenant(req) {
  return {
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
  };
}

export async function listProductsController(req, res, next) {
  try {
    res.json(await listProducts(tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function getProductController(req, res, next) {
  try {
    const product = await getProductById(req.params.id, tenant(req));
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function createProductController(req, res, next) {
  try {
    res.status(201).json(await createProduct(req.body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function updateProductController(req, res, next) {
  try {
    const product = await updateProduct(req.params.id, req.body, tenant(req));
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function deleteProductController(req, res, next) {
  try {
    const deleted = await deleteProduct(req.params.id, tenant(req));
    if (!deleted) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function bulkProductsController(req, res, next) {
  try {
    const { branchId } = await resolveTenantBranchId(req);
    if (!branchId) {
      return res.status(400).json({
        error:
          "No branch for this account. Assign branchId on the user or ensure a default Branch exists.",
      });
    }
    const items = req.body.items ?? [];
    const before = await countProductsInBranch(branchId);
    const inventory = await mergeProducts(items, { branchId });
    const after = await countProductsInBranch(branchId);
    console.log("[products/bulk] items:", items.length, "Product count (branch):", before, "→", after);
    res.json({ count: items.length, inventory, productCount: after, productCountBefore: before });
  } catch (err) {
    next(err);
  }
}

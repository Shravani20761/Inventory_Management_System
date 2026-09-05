import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePurchaseBranchId } from "../utils/tenant.js";

const WAKAD = "64a000000000000000000001";
const RAVET = "64a000000000000000000002";
const PIMPLE = "64a000000000000000000003";

function req({ role, branchId, header, bodyBranchId, scope } = {}) {
  return {
    user: { role, branchId },
    headers: header ? { "x-branch-id": header } : {},
    body: bodyBranchId ? { branchId: bodyBranchId } : {},
    branchScope: scope,
  };
}

function throwsStatus(fn, status, messageIncludes) {
  try {
    fn();
    assert.fail("expected error");
  } catch (e) {
    assert.equal(e.status, status, e.message);
    if (messageIncludes) assert.match(String(e.message), messageIncludes);
  }
}

test("HQ + All Branches (no purchase branch) → must select a concrete branch", () => {
  throwsStatus(
    () =>
      resolvePurchaseBranchId(
        req({
          role: "superAdmin",
          header: "all",
          scope: { isHq: true, mode: "all", branchId: null },
        }),
        null,
      ),
    400,
    /Select the branch for this purchase/,
  );
});

test("HQ + body.branchId Wakad → uses Wakad even when dashboard is All", () => {
  const id = resolvePurchaseBranchId(
    req({
      role: "superAdmin",
      header: "all",
      bodyBranchId: WAKAD,
      scope: { isHq: true, mode: "all", branchId: null },
    }),
    WAKAD,
  );
  assert.equal(id, WAKAD);
});

test("HQ requested 'all' is not a purchase branch", () => {
  throwsStatus(
    () =>
      resolvePurchaseBranchId(
        req({
          role: "superAdmin",
          header: "all",
          scope: { isHq: true, mode: "all", branchId: null },
        }),
        "all",
      ),
    400,
    /Select the branch for this purchase/,
  );
});

test("HQ + Pimple Saudagar body → that branch", () => {
  const id = resolvePurchaseBranchId(
    req({
      role: "superAdmin",
      header: "all",
      scope: { isHq: true, mode: "all", branchId: null },
    }),
    PIMPLE,
  );
  assert.equal(id, PIMPLE);
});

test("Manager assigned to Wakad → uses JWT/scope branch, no selector required", () => {
  const id = resolvePurchaseBranchId(
    req({
      role: "manager",
      branchId: WAKAD,
      header: "all",
      scope: { isHq: false, mode: "one", branchId: WAKAD },
    }),
    null,
  );
  assert.equal(id, WAKAD);
});

test("Manager from Wakad sending Ravet branchId → 403", () => {
  throwsStatus(
    () =>
      resolvePurchaseBranchId(
        req({
          role: "manager",
          branchId: WAKAD,
          bodyBranchId: RAVET,
          scope: { isHq: false, mode: "one", branchId: WAKAD },
        }),
        RAVET,
      ),
    403,
    /cannot create purchases for another branch/,
  );
});

test("Staff assigned to Pimple → uses assigned branch when no branchId sent", () => {
  const id = resolvePurchaseBranchId(
    req({
      role: "staff",
      branchId: PIMPLE,
      scope: { isHq: false, mode: "one", branchId: PIMPLE },
    }),
    null,
  );
  assert.equal(id, PIMPLE);
});

test("Staff from Wakad sending Ravet branchId → 403", () => {
  throwsStatus(
    () =>
      resolvePurchaseBranchId(
        req({
          role: "staff",
          branchId: WAKAD,
          bodyBranchId: RAVET,
          scope: { isHq: false, mode: "one", branchId: WAKAD },
        }),
        RAVET,
      ),
    403,
    /cannot create purchases for another branch/,
  );
});

test("Manager/Staff with no assigned branch → assigned-branch error, not generic selector error", () => {
  throwsStatus(
    () =>
      resolvePurchaseBranchId(
        req({
          role: "staff",
          branchId: null,
          scope: { isHq: false, mode: "one", branchId: null },
        }),
        null,
      ),
    400,
    /not assigned to a branch/,
  );
});

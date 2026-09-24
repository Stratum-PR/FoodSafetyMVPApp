import { describe, expect, it } from "vitest";

import {
  type ApprovalInput,
  approvalWarnings,
  availableActions,
  checkApprovalAction,
  decideApproval,
} from "./approval";
import type { Party } from "./suppliers";

const TODAY = "2026-09-24";
const input = (extra: Partial<ApprovalInput>): ApprovalInput => ({
  action: "approve",
  reason: "",
  conditions: "",
  reviewBy: "",
  ...extra,
});
const at = (lifecycle: Party["lifecycle"], approval: Party["approval"]) => ({ lifecycle, approval });

describe("approval actions", () => {
  it("offers only the decisions that fit the supplier's stage", () => {
    expect(availableActions(at("onboarding", "pending"))).toEqual([
      "start_verification",
      "approve",
      "approve_conditional",
      "deactivate",
    ]);
    expect(availableActions(at("verification", "pending"))).not.toContain("start_verification");
    expect(availableActions(at("monitoring", "approved"))).toEqual(["approve_conditional", "suspend", "deactivate"]);
    expect(availableActions(at("monitoring", "conditional"))).toContain("approve");
    expect(availableActions(at("suspended", "suspended"))).toEqual(["approve", "approve_conditional", "deactivate"]);
    expect(availableActions(at("inactive", "approved"))).toEqual(["reactivate"]);
  });

  it("needs the approve permission for decisions and the edit permission to start verification", () => {
    const purchasing = { userId: "p", role: "purchasing" } as const;
    const qm = { userId: "q", role: "quality_manager" } as const;
    expect(checkApprovalAction(purchasing, { createdBy: "x" }, "start_verification")).toBeNull();
    expect(checkApprovalAction(purchasing, { createdBy: "x" }, "approve")).toBe("no_permission");
    expect(checkApprovalAction(qm, { createdBy: "q" }, "approve")).toBeNull();
    expect(checkApprovalAction(qm, { createdBy: "q" }, "approve", { requireSecondPerson: true })).toBe("own_supplier");
  });
});

describe("approval decisions", () => {
  it("approves into monitoring", () => {
    expect(decideApproval(at("verification", "pending"), input({}), TODAY)).toEqual({
      ok: true,
      change: { approval: "approved", lifecycle: "monitoring", reason: undefined },
    });
  });

  it("refuses a decision that doesn't fit the stage", () => {
    expect(decideApproval(at("inactive", "approved"), input({ action: "suspend" }), TODAY)).toEqual({
      ok: false,
      errors: { action: "not_available" },
    });
  });

  it("requires a reason to suspend or deactivate", () => {
    const monitored = at("monitoring", "approved");
    expect(decideApproval(monitored, input({ action: "suspend" }), TODAY)).toMatchObject({
      errors: { reason: "required" },
    });
    expect(decideApproval(monitored, input({ action: "deactivate", reason: "no" }), TODAY)).toMatchObject({
      errors: { reason: "too_short" },
    });
    expect(
      decideApproval(monitored, input({ action: "suspend", reason: "Tres lotes rechazados" }), TODAY),
    ).toMatchObject({ ok: true, change: { approval: "suspended", lifecycle: "suspended" } });
  });

  it("requires conditions and a review date within a year for a conditional approval", () => {
    const pending = at("verification", "pending");
    expect(decideApproval(pending, input({ action: "approve_conditional" }), TODAY)).toMatchObject({
      errors: { conditions: "required", reviewBy: "required" },
    });
    const conditions = "Enviar el certificado GFSI 2026";
    expect(
      decideApproval(pending, input({ action: "approve_conditional", conditions, reviewBy: TODAY }), TODAY),
    ).toMatchObject({ errors: { reviewBy: "date_not_future" } });
    expect(
      decideApproval(pending, input({ action: "approve_conditional", conditions, reviewBy: "2027-10-01" }), TODAY),
    ).toMatchObject({ errors: { reviewBy: "date_too_far" } });
    expect(
      decideApproval(pending, input({ action: "approve_conditional", conditions, reviewBy: "2026-12-31" }), TODAY),
    ).toEqual({
      ok: true,
      change: {
        approval: "conditional",
        lifecycle: "monitoring",
        conditions,
        conditionsReviewBy: "2026-12-31",
        reason: undefined,
      },
    });
  });

  it("reactivates a supplier back where it was", () => {
    const reactivate = input({ action: "reactivate" });
    expect(decideApproval(at("inactive", "pending"), reactivate, TODAY)).toMatchObject({
      change: { lifecycle: "onboarding" },
    });
    expect(decideApproval(at("inactive", "approved"), reactivate, TODAY)).toMatchObject({
      change: { lifecycle: "monitoring", approval: "approved" },
    });
    expect(decideApproval(at("inactive", "suspended"), reactivate, TODAY)).toMatchObject({
      change: { lifecycle: "suspended" },
    });
  });
});

describe("approval warnings", () => {
  const approved = { approval: "approved" as const };

  it("warns about missing documents without blocking", () => {
    expect(approvalWarnings(approved, 3, [], TODAY)).toEqual([{ kind: "missing_documents", count: 3 }]);
    expect(approvalWarnings(approved, 0, [], TODAY)).toEqual([]);
  });

  it("warns at three nonconformities in the last twelve months", () => {
    const recent = ["2026-01-10", "2026-05-02", "2026-09-01"];
    expect(approvalWarnings(approved, 0, recent, TODAY)).toEqual([{ kind: "nonconformities", count: 3 }]);
    // One of them is more than twelve months old.
    expect(approvalWarnings(approved, 0, ["2025-09-01", ...recent.slice(1)], TODAY)).toEqual([]);
  });

  it("warns when a conditional approval is past its review date", () => {
    const conditional = { approval: "conditional" as const, conditionsReviewBy: "2026-09-01" };
    expect(approvalWarnings(conditional, 0, [], TODAY)).toEqual([{ kind: "conditions_overdue", since: "2026-09-01" }]);
    expect(approvalWarnings({ ...conditional, conditionsReviewBy: "2026-12-01" }, 0, [], TODAY)).toEqual([]);
  });
});

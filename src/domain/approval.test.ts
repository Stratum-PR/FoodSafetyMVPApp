import { describe, expect, it } from "vitest";

import {
  type ApprovalContext,
  type ApprovalInput,
  approvalState,
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
  basis: [],
  reviewBy: "",
  conditions: "",
  owner: "",
  effectiveOn: "",
  allowedSourceIds: [],
  restrictions: [],
  ...extra,
});
const context = (extra: Partial<ApprovalContext> = {}): ApprovalContext => ({
  blockingOpen: 0,
  owners: ["u-ana", "u-luis"],
  sourceIds: ["s1", "s2"],
  ...extra,
});
const at = (lifecycle: Party["lifecycle"], approval: Party["approval"], terms?: Party["terms"]) => ({
  lifecycle,
  approval,
  terms,
});
const decide = (party: ReturnType<typeof at>, extra: Partial<ApprovalInput>, ctx = context()) =>
  decideApproval(party, input(extra), TODAY, ctx);
const approve = { action: "approve" as const, basis: ["certification"], reviewBy: "2027-09-24" };
const conditional = {
  action: "approve_conditional" as const,
  basis: ["questionnaire"],
  reason: "Certificado en renovación",
  conditions: "Enviar el certificado GFSI 2026",
  owner: "u-ana",
  effectiveOn: TODAY,
  reviewBy: "2026-12-31",
};

describe("approval state", () => {
  it("tells pending, under verification, inactive and rejected apart", () => {
    expect(approvalState(at("onboarding", "pending"))).toBe("pending");
    expect(approvalState(at("verification", "pending"))).toBe("under_verification");
    expect(approvalState(at("monitoring", "conditional"))).toBe("conditional");
    expect(approvalState(at("suspended", "suspended"))).toBe("suspended");
    expect(approvalState(at("inactive", "approved"))).toBe("inactive");
    expect(approvalState(at("inactive", "rejected"))).toBe("rejected");
  });
});

describe("approval actions", () => {
  it("offers only the decisions that fit the supplier's stage", () => {
    expect(availableActions(at("onboarding", "pending"))).toEqual([
      "start_verification",
      "approve",
      "approve_conditional",
      "reject",
      "deactivate",
    ]);
    expect(availableActions(at("verification", "pending"))).not.toContain("start_verification");
    expect(availableActions(at("monitoring", "approved"))).toEqual([
      "approve",
      "approve_conditional",
      "suspend",
      "deactivate",
    ]);
    expect(availableActions(at("suspended", "suspended"))).toContain("reject");
    expect(availableActions(at("inactive", "approved"))).toEqual(["reactivate"]);
  });

  it("needs the approve permission for decisions and the edit permission to start verification", () => {
    const purchasing = { userId: "p", role: "purchasing" } as const;
    const qm = { userId: "q", role: "quality_manager" } as const;
    expect(checkApprovalAction(purchasing, { createdBy: "x" }, "start_verification")).toBeNull();
    expect(checkApprovalAction(purchasing, { createdBy: "x" }, "approve")).toBe("no_permission");
    expect(checkApprovalAction(purchasing, { createdBy: "x" }, "reject")).toBe("no_permission");
    expect(checkApprovalAction(qm, { createdBy: "q" }, "approve")).toBeNull();
    expect(checkApprovalAction(qm, { createdBy: "q" }, "approve", { requireSecondPerson: true })).toBe("own_supplier");
  });
});

describe("approval decisions", () => {
  it("approves into monitoring with its basis and next review", () => {
    expect(decide(at("verification", "pending"), approve)).toEqual({
      ok: true,
      change: {
        approval: "approved",
        lifecycle: "monitoring",
        terms: { reviewBy: "2027-09-24" },
        basis: ["certification"],
        reason: undefined,
      },
    });
  });

  it("needs a basis and a review date within three years to approve", () => {
    expect(decide(at("verification", "pending"), { action: "approve" })).toMatchObject({
      errors: { basis: "required", reviewBy: "required" },
    });
    expect(decide(at("verification", "pending"), { ...approve, basis: ["vibes"] })).toMatchObject({
      errors: { basis: "invalid" },
    });
    expect(decide(at("verification", "pending"), { ...approve, reviewBy: "2029-10-01" })).toMatchObject({
      errors: { reviewBy: "date_too_far" },
    });
  });

  it("blocks a full approval while a blocking requirement is unmet, but allows a conditional one", () => {
    const blocked = context({ blockingOpen: 1 });
    expect(decide(at("verification", "pending"), approve, blocked)).toMatchObject({
      ok: false,
      errors: { action: "blocked" },
    });
    expect(decide(at("verification", "pending"), conditional, blocked)).toMatchObject({ ok: true });
  });

  it("refuses a decision that doesn't fit the stage", () => {
    expect(decide(at("inactive", "approved"), { action: "suspend" })).toEqual({
      ok: false,
      errors: { action: "not_available" },
    });
  });

  it("requires a reason to suspend, reject or deactivate", () => {
    const monitored = at("monitoring", "approved");
    expect(decide(monitored, { action: "suspend" })).toMatchObject({ errors: { reason: "required" } });
    expect(decide(monitored, { action: "deactivate", reason: "no" })).toMatchObject({
      errors: { reason: "too_short" },
    });
    expect(decide(monitored, { action: "suspend", reason: "Tres lotes rechazados" })).toMatchObject({
      ok: true,
      change: { approval: "suspended", lifecycle: "suspended" },
    });
  });

  it("rejects into a disqualified state that a reactivation starts over from", () => {
    expect(decide(at("verification", "pending"), { action: "reject", reason: "Falló la auditoría" })).toMatchObject({
      ok: true,
      change: { approval: "rejected", lifecycle: "inactive" },
    });
    expect(decide(at("inactive", "rejected"), { action: "reactivate" })).toMatchObject({
      change: { approval: "pending", lifecycle: "onboarding" },
    });
  });

  it("requires a conditional approval's reason, conditions, owner, start and review within a year", () => {
    const pending = at("verification", "pending");
    expect(decide(pending, { action: "approve_conditional" })).toMatchObject({
      errors: {
        basis: "required",
        reason: "required",
        conditions: "required",
        owner: "required",
        effectiveOn: "required",
        reviewBy: "required",
      },
    });
    expect(decide(pending, { ...conditional, reviewBy: TODAY })).toMatchObject({
      errors: { reviewBy: "date_not_future" },
    });
    expect(decide(pending, { ...conditional, reviewBy: "2027-10-01" })).toMatchObject({
      errors: { reviewBy: "date_too_far" },
    });
    expect(decide(pending, { ...conditional, owner: "someone-else" })).toMatchObject({ errors: { owner: "invalid" } });
    expect(decide(pending, { ...conditional, effectiveOn: "2027-01-05" })).toMatchObject({
      errors: { effectiveOn: "after_review" },
    });
    expect(decide(pending, { ...conditional, allowedSourceIds: ["s9"] })).toMatchObject({
      errors: { allowedSourceIds: "invalid" },
    });
  });

  it("records the conditions, their scope and the receiving restrictions", () => {
    expect(
      decide(at("verification", "pending"), {
        ...conditional,
        allowedSourceIds: ["s1"],
        restrictions: ["coa_every_lot"],
      }),
    ).toEqual({
      ok: true,
      change: {
        approval: "conditional",
        lifecycle: "monitoring",
        basis: ["questionnaire"],
        reason: "Certificado en renovación",
        terms: {
          reviewBy: "2026-12-31",
          conditions: "Enviar el certificado GFSI 2026",
          owner: "u-ana",
          effectiveOn: TODAY,
          allowedSourceIds: ["s1"],
          restrictions: ["coa_every_lot"],
        },
      },
    });
  });

  it("reactivates a supplier back where it was, keeping its terms", () => {
    const reactivate = { action: "reactivate" as const };
    expect(decide(at("inactive", "pending"), reactivate)).toMatchObject({ change: { lifecycle: "onboarding" } });
    expect(decide(at("inactive", "approved", { reviewBy: "2027-01-01" }), reactivate)).toMatchObject({
      change: { lifecycle: "monitoring", approval: "approved", terms: { reviewBy: "2027-01-01" } },
    });
    expect(decide(at("inactive", "suspended"), reactivate)).toMatchObject({ change: { lifecycle: "suspended" } });
  });
});

describe("approval warnings", () => {
  const approved = at("monitoring", "approved");

  it("warns about missing documents and blocking requirements", () => {
    expect(approvalWarnings(approved, 3, 1, [], TODAY)).toEqual([
      { kind: "blocking", count: 1 },
      { kind: "missing_documents", count: 3 },
    ]);
    expect(approvalWarnings(approved, 0, 0, [], TODAY)).toEqual([]);
  });

  it("warns at three nonconformities in the last twelve months", () => {
    const recent = ["2026-01-10", "2026-05-02", "2026-09-01"];
    expect(approvalWarnings(approved, 0, 0, recent, TODAY)).toEqual([{ kind: "nonconformities", count: 3 }]);
    // One of them is more than twelve months old.
    expect(approvalWarnings(approved, 0, 0, ["2025-09-01", ...recent.slice(1)], TODAY)).toEqual([]);
  });

  it("warns when a conditional approval or a periodic review is overdue", () => {
    const late = at("monitoring", "conditional", { reviewBy: "2026-09-01" });
    expect(approvalWarnings(late, 0, 0, [], TODAY)).toEqual([{ kind: "conditions_overdue", since: "2026-09-01" }]);
    expect(approvalWarnings({ ...late, terms: { reviewBy: "2026-12-01" } }, 0, 0, [], TODAY)).toEqual([]);
    expect(approvalWarnings(at("monitoring", "approved", { reviewBy: "2026-09-01" }), 0, 0, [], TODAY)).toEqual([
      { kind: "review_overdue", since: "2026-09-01" },
    ]);
    // Nobody reviews an inactive supplier.
    expect(approvalWarnings(at("inactive", "approved", { reviewBy: "2026-09-01" }), 0, 0, [], TODAY)).toEqual([]);
  });
});

import { addMonths, type IsoDate, isIsoDate } from "./dates";
import { type Actor, can, checkApproveParty, type Denial, type ReviewPolicy } from "./permissions";
import type { Approval, Lifecycle, Party } from "./suppliers";

/*
 * Supplier approval (21 CFR 117.410(d) and SQF 2.4.4: suppliers are approved, the approval
 * is documented, and suppliers are monitored). Stages and decisions:
 *
 *   onboarding ─start_verification→ verification ─approve / approve_conditional→ monitoring
 *   monitoring ─suspend→ suspended ─approve / approve_conditional→ monitoring
 *   any stage ─deactivate→ inactive ─reactivate→ back where it was
 *
 * The system warns (missing documents, repeated nonconformities, overdue conditions) but
 * never decides: the decision and its reason are the user's, and each one is recorded.
 */

export type ApprovalAction =
  "start_verification" | "approve" | "approve_conditional" | "suspend" | "deactivate" | "reactivate";

export const REASON_MIN = 5;
export const TEXT_MAX = 1000;
/** Conditional approvals must be reviewed within a year. */
export const CONDITIONS_MAX_MONTHS = 12;

/** The decisions that make sense from where the supplier is now. */
export function availableActions(party: Pick<Party, "lifecycle" | "approval">): ApprovalAction[] {
  switch (party.lifecycle) {
    case "onboarding":
      return ["start_verification", "approve", "approve_conditional", "deactivate"];
    case "verification":
      return ["approve", "approve_conditional", "deactivate"];
    case "monitoring":
      return party.approval === "conditional"
        ? ["approve", "approve_conditional", "suspend", "deactivate"]
        : ["approve_conditional", "suspend", "deactivate"];
    case "suspended":
      return ["approve", "approve_conditional", "deactivate"];
    case "inactive":
      return ["reactivate"];
  }
}

/** Who may take a decision: starting verification is an edit; the rest are approval decisions. */
export function checkApprovalAction(
  actor: Actor,
  party: Pick<Party, "createdBy">,
  action: ApprovalAction,
  policy?: ReviewPolicy,
): Denial | null {
  if (action === "start_verification") return can(actor.role, "suppliers.edit") ? null : "no_permission";
  return checkApproveParty(actor, party, policy);
}

export type ApprovalInput = {
  action: ApprovalAction;
  reason: string;
  /** approve_conditional: what must happen (e.g. "send the 2026 GFSI certificate"). */
  conditions: string;
  /** approve_conditional: when the conditions are reviewed again. */
  reviewBy: string;
};

export type ApprovalField = "action" | "reason" | "conditions" | "reviewBy";
export type ApprovalError =
  "required" | "not_available" | "too_short" | "too_long" | "invalid_date" | "date_not_future" | "date_too_far";

export type ApprovalChange = {
  approval: Approval;
  lifecycle: Lifecycle;
  conditions?: string;
  conditionsReviewBy?: IsoDate;
  reason?: string;
};

export type ApprovalCheck =
  { ok: true; change: ApprovalChange } | { ok: false; errors: Partial<Record<ApprovalField, ApprovalError>> };

function checkText(value: string, required: boolean): ApprovalError | null {
  const text = value.trim();
  if (!text) return required ? "required" : null;
  if (text.length < REASON_MIN) return "too_short";
  if (text.length > TEXT_MAX) return "too_long";
  return null;
}

/**
 * Validates a decision and returns the supplier's new state. Suspending and deactivating need
 * a reason; a conditional approval needs its conditions and a review date within a year.
 */
export function decideApproval(
  party: Pick<Party, "lifecycle" | "approval">,
  input: ApprovalInput,
  today: IsoDate,
): ApprovalCheck {
  if (!availableActions(party).includes(input.action)) return { ok: false, errors: { action: "not_available" } };

  const errors: Partial<Record<ApprovalField, ApprovalError>> = {};
  const needsReason = input.action === "suspend" || input.action === "deactivate";
  const reasonError = checkText(input.reason, needsReason);
  if (reasonError) errors.reason = reasonError;

  const reason = input.reason.trim() || undefined;
  switch (input.action) {
    case "start_verification":
      return done({ approval: party.approval, lifecycle: "verification", reason });
    case "approve":
      return done({ approval: "approved", lifecycle: "monitoring", reason });
    case "suspend":
      return done({ approval: "suspended", lifecycle: "suspended", reason });
    case "deactivate":
      return done({ approval: party.approval, lifecycle: "inactive", reason });
    case "reactivate":
      return done({
        approval: party.approval,
        lifecycle:
          party.approval === "pending" ? "onboarding" : party.approval === "suspended" ? "suspended" : "monitoring",
        reason,
      });
    case "approve_conditional": {
      const conditionsError = checkText(input.conditions, true);
      if (conditionsError) errors.conditions = conditionsError;
      const reviewBy = input.reviewBy.trim();
      if (!reviewBy) errors.reviewBy = "required";
      else if (!isIsoDate(reviewBy)) errors.reviewBy = "invalid_date";
      else if (reviewBy <= today) errors.reviewBy = "date_not_future";
      else if (reviewBy > addMonths(today, CONDITIONS_MAX_MONTHS)) errors.reviewBy = "date_too_far";
      return done({
        approval: "conditional",
        lifecycle: "monitoring",
        conditions: input.conditions.trim(),
        conditionsReviewBy: reviewBy,
        reason,
      });
    }
  }

  function done(change: ApprovalChange): ApprovalCheck {
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, change };
  }
}

/* Warnings: shown next to the decision, never blocking it. */

/** Three nonconformities in twelve months call for a review (the first design partner's procedure). */
export const NONCONFORMITY_WARNING_COUNT = 3;
export const NONCONFORMITY_WINDOW_MONTHS = 12;

export type ApprovalWarning =
  | { kind: "missing_documents"; count: number }
  | { kind: "nonconformities"; count: number }
  | { kind: "conditions_overdue"; since: IsoDate };

export function approvalWarnings(
  party: Pick<Party, "approval" | "conditionsReviewBy">,
  unmetRequirements: number,
  nonconformityDates: IsoDate[],
  today: IsoDate,
): ApprovalWarning[] {
  const warnings: ApprovalWarning[] = [];
  if (unmetRequirements > 0) warnings.push({ kind: "missing_documents", count: unmetRequirements });
  const since = addMonths(today, -NONCONFORMITY_WINDOW_MONTHS);
  const recent = nonconformityDates.filter((d) => d > since && d <= today).length;
  if (recent >= NONCONFORMITY_WARNING_COUNT) warnings.push({ kind: "nonconformities", count: recent });
  if (party.approval === "conditional" && party.conditionsReviewBy && party.conditionsReviewBy < today) {
    warnings.push({ kind: "conditions_overdue", since: party.conditionsReviewBy });
  }
  return warnings;
}

/** One decision in a supplier's approval history. Nothing is overwritten: each decision is a new record. */
export type ApprovalRecord = {
  id: string;
  partyId: string;
  on: IsoDate;
  actorId: string;
  action: ApprovalAction;
  from: { approval: Approval; lifecycle: Lifecycle };
  to: { approval: Approval; lifecycle: Lifecycle };
  reason?: string;
  conditions?: string;
  reviewBy?: IsoDate;
  /** The supplier's document compliance when the decision was made, for the record. */
  compliancePercent?: number;
};

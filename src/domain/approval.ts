import { addMonths, type IsoDate, isIsoDate } from "./dates";
import { type Actor, can, checkApproveParty, type Denial, type ReviewPolicy } from "./permissions";
import {
  type Approval,
  type ApprovalTerms,
  type Lifecycle,
  type Party,
  type Restriction,
  RESTRICTIONS,
} from "./suppliers";

/*
 * Supplier approval (21 CFR 117.410(d) and SQF 2.4.4: suppliers are approved, the approval
 * is documented, and suppliers are monitored). Stages and decisions:
 *
 *   onboarding ─start_verification→ verification ─approve / approve_conditional→ monitoring
 *   monitoring ─suspend→ suspended ─approve / approve_conditional→ monitoring
 *   onboarding, verification, suspended ─reject→ rejected (disqualified; not bought from)
 *   any stage ─deactivate→ inactive ─reactivate→ back where it was (a rejected one starts over)
 *
 * The system warns (missing documents, repeated nonconformities, overdue reviews) but never
 * decides: the decision, its basis and its reason are a person's, and each one is recorded.
 * The one exception is a requirement the company marked as blocking: while one is unmet, a
 * full approval isn't possible (a conditional approval, with its conditions, still is).
 */

export type ApprovalAction =
  "start_verification" | "approve" | "approve_conditional" | "suspend" | "reject" | "deactivate" | "reactivate";

/** What the approval rests on. At least one is required to approve. */
export const APPROVAL_BASES = [
  "questionnaire",
  "certification",
  "audit",
  "specification",
  "testing",
  "performance",
  "history",
] as const;
export type ApprovalBasis = (typeof APPROVAL_BASES)[number];

export const REASON_MIN = 5;
export const TEXT_MAX = 1000;
/** Conditional approvals must be reviewed within a year. */
export const CONDITIONS_MAX_MONTHS = 12;
/** A full approval is reviewed at least every three years; the form proposes one year. */
export const REVIEW_MAX_MONTHS = 36;
export const REVIEW_DEFAULT_MONTHS = 12;

/** The state people see: approval and lifecycle combined, so inactive, suspended and rejected read differently. */
export type ApprovalState =
  "pending" | "under_verification" | "approved" | "conditional" | "suspended" | "rejected" | "inactive";

export const APPROVAL_STATES: ApprovalState[] = [
  "pending",
  "under_verification",
  "approved",
  "conditional",
  "suspended",
  "rejected",
  "inactive",
];

export function approvalState(party: Pick<Party, "approval" | "lifecycle">): ApprovalState {
  if (party.approval === "rejected") return "rejected";
  if (party.lifecycle === "inactive") return "inactive";
  if (party.approval === "pending") return party.lifecycle === "verification" ? "under_verification" : "pending";
  return party.approval;
}

/** The decisions that make sense from where the supplier is now. */
export function availableActions(party: Pick<Party, "lifecycle" | "approval">): ApprovalAction[] {
  switch (party.lifecycle) {
    case "onboarding":
      return ["start_verification", "approve", "approve_conditional", "reject", "deactivate"];
    case "verification":
      return ["approve", "approve_conditional", "reject", "deactivate"];
    case "monitoring":
      // Approving again renews the approval with a new review date.
      return ["approve", "approve_conditional", "suspend", "deactivate"];
    case "suspended":
      return ["approve", "approve_conditional", "reject", "deactivate"];
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
  /** approve / approve_conditional: what the decision rests on. */
  basis: string[];
  /** approve / approve_conditional: when it's reviewed again. */
  reviewBy: string;
  /** approve_conditional: what must happen (e.g. "send the 2026 GFSI certificate"). */
  conditions: string;
  /** approve_conditional: who follows the conditions up. */
  owner: string;
  /** approve_conditional: from when it applies. */
  effectiveOn: string;
  /** approve_conditional: the sources it may supply (empty = all its active sources). */
  allowedSourceIds: string[];
  /** approve_conditional: receiving restrictions. */
  restrictions: string[];
};

/** Facts the decision is checked against. */
export type ApprovalContext = {
  /** Unmet blocking obligations: while any remain, a full approval isn't possible. */
  blockingOpen: number;
  /** People who can own conditions (the company's users). */
  owners: string[];
  /** The supplier's sources, for the conditional scope. */
  sourceIds: string[];
};

export type ApprovalField =
  | "action"
  | "reason"
  | "basis"
  | "reviewBy"
  | "conditions"
  | "owner"
  | "effectiveOn"
  | "allowedSourceIds"
  | "restrictions";
export type ApprovalError =
  | "required"
  | "not_available"
  | "blocked"
  | "invalid"
  | "too_short"
  | "too_long"
  | "invalid_date"
  | "date_not_future"
  | "date_too_far"
  | "after_review";

export type ApprovalChange = {
  approval: Approval;
  lifecycle: Lifecycle;
  terms?: ApprovalTerms;
  basis?: ApprovalBasis[];
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

function checkFutureDate(value: string, today: IsoDate, maxMonths: number): ApprovalError | null {
  if (!value) return "required";
  if (!isIsoDate(value)) return "invalid_date";
  if (value <= today) return "date_not_future";
  if (value > addMonths(today, maxMonths)) return "date_too_far";
  return null;
}

/**
 * Validates a decision and returns the supplier's new state. Suspending, rejecting and
 * deactivating need a reason. Approving needs its basis and a review date; a conditional
 * approval also needs its reason, conditions, owner, start date and a review within a year.
 */
export function decideApproval(
  party: Pick<Party, "lifecycle" | "approval" | "terms">,
  input: ApprovalInput,
  today: IsoDate,
  context: ApprovalContext,
): ApprovalCheck {
  if (!availableActions(party).includes(input.action)) return { ok: false, errors: { action: "not_available" } };

  const errors: Partial<Record<ApprovalField, ApprovalError>> = {};
  const set = (field: ApprovalField, error: ApprovalError | null) => {
    if (error) errors[field] = error;
  };
  const approving = input.action === "approve" || input.action === "approve_conditional";
  const conditional = input.action === "approve_conditional";
  const needsReason = conditional || ["suspend", "reject", "deactivate"].includes(input.action);
  set("reason", checkText(input.reason, needsReason));
  const reason = input.reason.trim() || undefined;

  let basis: ApprovalBasis[] | undefined;
  const reviewBy = input.reviewBy.trim();
  if (approving) {
    basis = [...new Set(input.basis)].filter((b): b is ApprovalBasis =>
      (APPROVAL_BASES as readonly string[]).includes(b),
    );
    if (!basis.length) set("basis", input.basis.length ? "invalid" : "required");
    set("reviewBy", checkFutureDate(reviewBy, today, conditional ? CONDITIONS_MAX_MONTHS : REVIEW_MAX_MONTHS));
  }
  if (input.action === "approve" && context.blockingOpen > 0) set("action", "blocked");

  switch (input.action) {
    case "start_verification":
      return done({ approval: party.approval, lifecycle: "verification", terms: party.terms, reason });
    case "approve":
      return done({ approval: "approved", lifecycle: "monitoring", terms: { reviewBy }, basis, reason });
    case "suspend":
      return done({ approval: "suspended", lifecycle: "suspended", reason });
    case "reject":
      return done({ approval: "rejected", lifecycle: "inactive", reason });
    case "deactivate":
      // Terms stay on record while inactive, so a reactivation starts from them.
      return done({ approval: party.approval, lifecycle: "inactive", terms: party.terms, reason });
    case "reactivate":
      if (party.approval === "rejected") return done({ approval: "pending", lifecycle: "onboarding", reason });
      return done({
        approval: party.approval,
        lifecycle:
          party.approval === "pending" ? "onboarding" : party.approval === "suspended" ? "suspended" : "monitoring",
        terms: party.terms,
        reason,
      });
    case "approve_conditional": {
      set("conditions", checkText(input.conditions, true));
      const owner = input.owner.trim();
      if (!owner) set("owner", "required");
      else if (!context.owners.includes(owner)) set("owner", "invalid");
      const effectiveOn = input.effectiveOn.trim();
      if (!effectiveOn) set("effectiveOn", "required");
      else if (!isIsoDate(effectiveOn)) set("effectiveOn", "invalid_date");
      else if (isIsoDate(reviewBy) && effectiveOn >= reviewBy) set("effectiveOn", "after_review");
      const allowed = [...new Set(input.allowedSourceIds)];
      if (allowed.some((id) => !context.sourceIds.includes(id))) set("allowedSourceIds", "invalid");
      const restrictions = [...new Set(input.restrictions)];
      if (restrictions.some((r) => !(RESTRICTIONS as readonly string[]).includes(r))) set("restrictions", "invalid");
      return done({
        approval: "conditional",
        lifecycle: "monitoring",
        terms: {
          reviewBy,
          conditions: input.conditions.trim(),
          owner,
          effectiveOn,
          allowedSourceIds: allowed,
          restrictions: restrictions as Restriction[],
        },
        basis,
        reason,
      });
    }
  }

  function done(change: ApprovalChange): ApprovalCheck {
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, change };
  }
}

/* Warnings: shown next to the decision, never blocking it (blocking requirements are errors, above). */

/** Three nonconformities in twelve months call for a review (the first design partner's procedure). */
export const NONCONFORMITY_WARNING_COUNT = 3;
export const NONCONFORMITY_WINDOW_MONTHS = 12;

export type ApprovalWarning =
  | { kind: "missing_documents"; count: number }
  | { kind: "blocking"; count: number }
  | { kind: "nonconformities"; count: number }
  | { kind: "conditions_overdue"; since: IsoDate }
  | { kind: "review_overdue"; since: IsoDate };

export function approvalWarnings(
  party: Pick<Party, "approval" | "lifecycle" | "terms">,
  unmetRequirements: number,
  blockingOpen: number,
  nonconformityDates: IsoDate[],
  today: IsoDate,
): ApprovalWarning[] {
  const warnings: ApprovalWarning[] = [];
  if (blockingOpen > 0) warnings.push({ kind: "blocking", count: blockingOpen });
  if (unmetRequirements > 0) warnings.push({ kind: "missing_documents", count: unmetRequirements });
  const since = addMonths(today, -NONCONFORMITY_WINDOW_MONTHS);
  const recent = nonconformityDates.filter((d) => d > since && d <= today).length;
  if (recent >= NONCONFORMITY_WARNING_COUNT) warnings.push({ kind: "nonconformities", count: recent });
  const reviewBy = party.terms?.reviewBy;
  if (reviewBy && reviewBy < today && party.lifecycle !== "inactive") {
    if (party.approval === "conditional") warnings.push({ kind: "conditions_overdue", since: reviewBy });
    else if (party.approval === "approved") warnings.push({ kind: "review_overdue", since: reviewBy });
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
  basis?: ApprovalBasis[];
  /** The terms set by this decision (review date, conditions and their scope). */
  terms?: ApprovalTerms;
  /** The rule set in force, so the decision can be read against the rules of its day. */
  ruleVersion?: string;
  /** Requirements met when the decision was made (met of applicable), for the record. */
  requirementsAt?: { met: number; applicable: number };
  /** Older records: the document compliance percentage when the decision was made. */
  compliancePercent?: number;
};

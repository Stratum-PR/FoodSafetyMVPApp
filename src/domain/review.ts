import type { IsoDate } from "./dates";
import {
  canGiveFinalReview,
  checkVerification,
  type VerificationError,
  type VerificationField,
  type VerificationInput,
} from "./evidence";
import { type Actor, checkReviewDocument, DEFAULT_REVIEW_POLICY, type Denial, type ReviewPolicy } from "./permissions";
import type { SupplierDocument } from "./suppliers";
import { sameRecord } from "./versions";

/*
 * Accepting or rejecting an uploaded document. Rules:
 * - Only roles with documents.review. The uploader may review their own document unless the
 *   company requires a second person (ReviewPolicy; off by default, see permissions.ts).
 * - High-risk evidence is decided only by a role that approves suppliers (the final review).
 * - Only documents waiting for review can be decided; a decision is final (upload a new one).
 * - Accepting needs a stored file and the reviewer's checklist and details (evidence.ts).
 *   Uploaded and waiting documents never count toward a requirement.
 * - A rejection needs a reason, so the supplier knows what to fix.
 * - Accepting a document replaces ("supersedes") the previous accepted version of the same
 *   record: same type, same supplier or material, same lot. Per-lot documents never replace each other.
 */

export type ReviewDecision = "accept" | "reject";

export const REASON_MIN = 5;
export const REASON_MAX = 500;

export type ReviewDenial =
  | Denial
  | "not_pending"
  | "reason_required"
  | "reason_too_long"
  | "no_file"
  | "final_review_required"
  | "verification_invalid";

export type ReviewResult =
  | { ok: true; document: SupplierDocument; superseded: SupplierDocument[] }
  | { ok: false; denial: ReviewDenial; errors?: Partial<Record<VerificationField, VerificationError>> };

/** Whether the actor may decide this document at all (for showing or hiding the buttons). */
export function checkCanReview(
  actor: Actor,
  doc: SupplierDocument,
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
  highRisk = false,
): ReviewDenial | null {
  if (doc.state !== "pending_review") return "not_pending";
  const denial = checkReviewDocument(actor, doc, policy);
  if (denial) return denial;
  if (highRisk && !canGiveFinalReview(actor.role)) return "final_review_required";
  return null;
}

/** Why this document can't be accepted even by someone allowed to review it (it can still be rejected). */
export function checkCanAccept(doc: SupplierDocument): "no_file" | null {
  return doc.file?.sha256 ? null : "no_file";
}

export type ReviewInput = {
  doc: SupplierDocument;
  /** The company's other documents. */
  others: SupplierDocument[];
  actor: Actor;
  decision: ReviewDecision;
  reason: string;
  today: IsoDate;
  perLot: boolean;
  policy?: ReviewPolicy;
  highRisk?: boolean;
  /** Required to accept. */
  verification?: VerificationInput;
};

/**
 * Decides a document. Returns the updated document plus any older versions it replaces;
 * never changes its inputs.
 */
export function reviewDocument(input: ReviewInput): ReviewResult {
  const { doc, others, actor, decision, today, perLot } = input;
  const denial = checkCanReview(actor, doc, input.policy, input.highRisk);
  if (denial) return { ok: false, denial };

  const trimmed = input.reason.trim();
  if (trimmed.length > REASON_MAX) return { ok: false, denial: "reason_too_long" };
  const reviewed = { reviewedBy: actor.userId, reviewedOn: today };

  if (decision === "reject") {
    if (trimmed.length < REASON_MIN) return { ok: false, denial: "reason_required" };
    return { ok: true, document: { ...doc, ...reviewed, state: "rejected", rejectionReason: trimmed }, superseded: [] };
  }

  const noFile = checkCanAccept(doc);
  if (noFile) return { ok: false, denial: noFile };
  const check = checkVerification(doc.typeCode, input.verification ?? { checklist: [] }, today);
  if (!check.ok) return { ok: false, denial: "verification_invalid", errors: check.errors };

  const superseded = perLot
    ? []
    : others
        .filter((o) => o.id !== doc.id && o.state === "accepted" && sameRecord(o, doc))
        .map((o) => ({ ...o, state: "superseded" as const }));
  return {
    ok: true,
    document: { ...doc, ...reviewed, state: "accepted", verification: check.verification },
    superseded,
  };
}

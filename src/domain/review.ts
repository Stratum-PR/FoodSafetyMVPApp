import type { IsoDate } from "./dates";
import { type Actor, checkReviewDocument, DEFAULT_REVIEW_POLICY, type Denial, type ReviewPolicy } from "./permissions";
import type { SupplierDocument } from "./suppliers";

/*
 * Accepting or rejecting an uploaded document. Rules:
 * - Only roles with documents.review. The uploader may review their own document unless the
 *   company requires a second person (ReviewPolicy; off by default, see permissions.ts).
 * - Only documents waiting for review can be decided; a decision is final (upload a new one).
 * - A rejection needs a reason, so the supplier knows what to fix.
 * - Accepting a document replaces ("supersedes") the older accepted document of the same type
 *   for the same supplier or material. Per-lot documents (COA) never replace each other.
 */

export type ReviewDecision = "accept" | "reject";

export const REASON_MIN = 5;
export const REASON_MAX = 500;

export type ReviewDenial = Denial | "not_pending" | "reason_required" | "reason_too_long";

export type ReviewResult =
  { ok: true; document: SupplierDocument; superseded: SupplierDocument[] } | { ok: false; denial: ReviewDenial };

function sameSubject(a: SupplierDocument, b: SupplierDocument): boolean {
  if (a.subject.kind === "party" && b.subject.kind === "party") return a.subject.partyId === b.subject.partyId;
  if (a.subject.kind === "source" && b.subject.kind === "source") return a.subject.sourceId === b.subject.sourceId;
  return false;
}

/** Whether the actor may decide this document at all (for showing or hiding the buttons). */
export function checkCanReview(
  actor: Actor,
  doc: SupplierDocument,
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
): ReviewDenial | null {
  if (doc.state !== "pending_review") return "not_pending";
  return checkReviewDocument(actor, doc, policy);
}

/**
 * Decides a document. Returns the updated document plus any older documents it replaces;
 * never changes its inputs. `others` are the company's other documents.
 */
export function reviewDocument(
  doc: SupplierDocument,
  others: SupplierDocument[],
  actor: Actor,
  decision: ReviewDecision,
  reason: string,
  today: IsoDate,
  perLot: boolean,
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
): ReviewResult {
  const denial = checkCanReview(actor, doc, policy);
  if (denial) return { ok: false, denial };

  const trimmed = reason.trim();
  if (trimmed.length > REASON_MAX) return { ok: false, denial: "reason_too_long" };
  const reviewed = { reviewedBy: actor.userId, reviewedOn: today };

  if (decision === "reject") {
    if (trimmed.length < REASON_MIN) return { ok: false, denial: "reason_required" };
    return { ok: true, document: { ...doc, ...reviewed, state: "rejected", rejectionReason: trimmed }, superseded: [] };
  }

  const superseded = perLot
    ? []
    : others
        .filter((o) => o.id !== doc.id && o.state === "accepted" && o.typeCode === doc.typeCode && sameSubject(o, doc))
        .map((o) => ({ ...o, state: "superseded" as const }));
  return { ok: true, document: { ...doc, ...reviewed, state: "accepted" }, superseded };
}

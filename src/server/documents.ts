import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { IsoDate } from "@/domain/dates";
import { AppError } from "@/domain/errors";
import { checkCanReview, type ReviewDecision, type ReviewDenial, reviewDocument } from "@/domain/review";
import { documentVersions } from "@/domain/versions";

import { type RequestContext, requirePermission } from "./context";
import { type DocumentRow, toDocumentRows } from "./document-list";
import { getSampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";

/*
 * Document service. Reads and changes the in-memory sample store for now; later the
 * same functions run against Postgres. Every change is recorded as an activity event.
 */

export async function listDocuments(ctx: RequestContext): Promise<DocumentRow[]> {
  requirePermission(ctx, "documents.view");
  return toDocumentRows(getSampleStore(ctx.company.slug, ctx.today), SAMPLE_USERS);
}

export type DocumentDetail = DocumentRow & {
  issuedOn?: IsoDate;
  /** Whether the expiration comes from the document itself (not the catalog's default validity). */
  printedExpiry: boolean;
  validityMonths: number | null;
  reviewedByName?: string;
  reviewedOn?: IsoDate;
  rejectionReason?: string;
  /** Why the current user can't accept or reject it; null when they can. */
  reviewDenial: ReviewDenial | null;
  /** Every version of this document, newest first, including this one. Nothing is ever deleted. */
  versions: DocumentRow[];
};

export async function getDocument(ctx: RequestContext, id: string): Promise<DocumentDetail | null> {
  requirePermission(ctx, "documents.view");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const doc = store.documents.find((d) => d.id === id);
  if (!doc) return null;
  const row = toDocumentRows({ ...store, documents: [doc] }, SAMPLE_USERS)[0];
  return {
    ...row,
    issuedOn: doc.issuedOn,
    printedExpiry: Boolean(doc.expiresOn),
    validityMonths: findType(DEFAULT_CATALOG, doc.typeCode)?.validityMonths ?? null,
    reviewedByName: doc.reviewedBy
      ? (SAMPLE_USERS.find((u) => u.id === doc.reviewedBy)?.name ?? doc.reviewedBy)
      : undefined,
    reviewedOn: doc.reviewedOn,
    rejectionReason: doc.rejectionReason,
    reviewDenial: checkCanReview(ctx.actor, doc),
    versions: toDocumentRows({ ...store, documents: documentVersions(doc, store.documents) }, SAMPLE_USERS),
  };
}

export type ReviewOutcome = { ok: true; superseded: number } | { ok: false; denial: ReviewDenial };

/** Accepts or rejects a document waiting for review. */
export async function decideDocument(
  ctx: RequestContext,
  id: string,
  decision: ReviewDecision,
  reason: string,
): Promise<ReviewOutcome> {
  requirePermission(ctx, "documents.review");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const doc = store.documents.find((d) => d.id === id);
  if (!doc) throw new AppError("not_found", "document");

  const perLot = findType(DEFAULT_CATALOG, doc.typeCode)?.perLot ?? false;
  const result = reviewDocument(doc, store.documents, ctx.actor, decision, reason, ctx.today, perLot);
  if (!result.ok) return result;

  const changed = new Map([result.document, ...result.superseded].map((d) => [d.id, d]));
  store.documents = store.documents.map((d) => changed.get(d.id) ?? d);

  const row = toDocumentRows({ ...store, documents: [result.document] }, SAMPLE_USERS)[0];
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: decision === "accept" ? "document.accepted" : "document.rejected",
    documentId: doc.id,
    partyId: row.partyId,
    detail: decision === "accept" ? String(result.superseded.length) : result.document.rejectionReason,
  });
  return { ok: true, superseded: result.superseded.length };
}

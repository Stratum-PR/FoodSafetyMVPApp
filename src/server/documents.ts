import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { IsoDate } from "@/domain/dates";
import { AppError } from "@/domain/errors";
import { DEFAULT_REVIEW_POLICY, type ReviewPolicy } from "@/domain/permissions";
import { checkCanReview, type ReviewDecision, type ReviewDenial, reviewDocument } from "@/domain/review";
import type { DocumentSubject, FileRef, MaterialKind, SupplierDocument } from "@/domain/suppliers";
import { checkUpload, MAX_FILE_BYTES, safeFileName, type UploadError, type UploadField } from "@/domain/upload";
import { documentVersions } from "@/domain/versions";

import { type RequestContext, requirePermission } from "./context";
import { type DocumentRow, toDocumentRows } from "./document-list";
import { type FileStore, localFileStore } from "./files/local-store";
import { getSampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";

/*
 * Document service. Reads and changes the in-memory sample store for now; later the
 * same functions run against Postgres. Every change is recorded as an activity event.
 */

/** Local folder until Azure Blob Storage is set up (docs/azure-setup.md, step 8). */
let fileStore: FileStore | undefined;
function files(): FileStore {
  return (fileStore ??= localFileStore(process.env.LOCAL_FILE_DIR || ".data/uploads"));
}

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
  /** The stored file, if there is one (sample documents have none). */
  file?: Omit<FileRef, "key">;
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
    file: doc.file ? { name: doc.file.name, size: doc.file.size, contentType: doc.file.contentType } : undefined,
    reviewDenial: checkCanReview(ctx.actor, doc, store.policy),
    versions: toDocumentRows({ ...store, documents: documentVersions(doc, store.documents) }, SAMPLE_USERS),
  };
}

/** A document's file for viewing or downloading, or null if it has none. */
export async function getDocumentFile(
  ctx: RequestContext,
  id: string,
): Promise<{ data: Uint8Array; file: FileRef } | null> {
  requirePermission(ctx, "documents.view");
  const doc = getSampleStore(ctx.company.slug, ctx.today).documents.find((d) => d.id === id);
  if (!doc?.file) return null;
  const data = await files().read(doc.file.key);
  return data ? { data, file: doc.file } : null;
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
  const result = reviewDocument(doc, store.documents, ctx.actor, decision, reason, ctx.today, perLot, store.policy);
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

/* Upload */

export type UploadTarget = {
  id: string;
  name: string;
  /** The materials this supplier makes or distributes, to file material-level documents on. */
  materials: { sourceId: string; name: string; code: string; kind: MaterialKind; role: "makes" | "sells" }[];
};

/** Suppliers and their materials, for the upload form's pickers. */
export async function listUploadTargets(ctx: RequestContext): Promise<UploadTarget[]> {
  requirePermission(ctx, "documents.upload");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const materials = new Map(store.materials.map((m) => [m.id, m]));
  return store.parties
    .map((p) => ({
      id: p.id,
      name: p.name,
      materials: store.sources
        .filter((s) => s.status !== "rejected" && (s.manufacturerId === p.id || s.distributorId === p.id))
        .map((s) => {
          const m = materials.get(s.materialId)!;
          return {
            sourceId: s.id,
            name: m.name,
            code: m.code,
            kind: m.kind,
            role: s.manufacturerId === p.id ? ("makes" as const) : ("sells" as const),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type UploadRequest = {
  partyId: string;
  /** "party" for the supplier's own documents, or a source id for a material's. */
  about: string;
  typeCode: string;
  lotCode: string;
  issuedOn: string;
  expiresOn: string;
  file: File | null;
};

export type UploadOutcome = { ok: true; id: string } | { ok: false; errors: Partial<Record<UploadField, UploadError>> };

/** Files a new document. It enters the review queue; the uploader can't review it. */
export async function uploadDocument(ctx: RequestContext, req: UploadRequest): Promise<UploadOutcome> {
  requirePermission(ctx, "documents.upload");
  const store = getSampleStore(ctx.company.slug, ctx.today);

  // The subject must be a real supplier of this company, and the material one it makes or sells.
  const party = store.parties.find((p) => p.id === req.partyId);
  let subject: DocumentSubject | null = null;
  let materialKind: MaterialKind | null = null;
  if (party && req.about === "party") subject = { kind: "party", partyId: party.id };
  else if (party) {
    const source = store.sources.find(
      (s) => s.id === req.about && (s.manufacturerId === party.id || s.distributorId === party.id),
    );
    if (source) {
      subject = { kind: "source", sourceId: source.id };
      materialKind = store.materials.find((m) => m.id === source.materialId)?.kind ?? null;
    }
  }

  // Only read the file into memory when it's within the size limit.
  const file = req.file && req.file.size > 0 ? req.file : null;
  const data = file && file.size <= MAX_FILE_BYTES ? new Uint8Array(await file.arrayBuffer()) : null;
  const check = checkUpload(
    {
      subject,
      materialKind,
      typeCode: req.typeCode,
      lotCode: req.lotCode,
      issuedOn: req.issuedOn,
      expiresOn: req.expiresOn,
      file: req.file ? { size: req.file.size, head: data?.subarray(0, 16) ?? new Uint8Array() } : null,
    },
    DEFAULT_CATALOG,
    ctx.today,
  );
  if (!check.ok) return check;

  const id = `up-${randomUUID()}`;
  const name = safeFileName(file!.name, check.fileType);
  const key = `${ctx.company.slug}/${id}/${name}`;
  await files().put(key, data!);

  const doc: SupplierDocument = {
    id,
    typeCode: req.typeCode,
    subject: subject!,
    state: "pending_review",
    receivedOn: ctx.today,
    issuedOn: check.issuedOn,
    expiresOn: check.expiresOn,
    lotCode: check.lotCode,
    uploadedBy: ctx.actor.userId,
    file: { key, name, size: data!.byteLength, contentType: check.fileType },
  };
  store.documents = [...store.documents, doc];
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: "document.uploaded",
    documentId: id,
    partyId: party!.id,
  });
  return { ok: true, id };
}

/** The company's separation-of-duties choice (see ReviewPolicy). */
export async function getReviewPolicy(ctx: RequestContext): Promise<ReviewPolicy> {
  // Stores created before policies existed (a running dev server) fall back to the default.
  return getSampleStore(ctx.company.slug, ctx.today).policy ?? DEFAULT_REVIEW_POLICY;
}

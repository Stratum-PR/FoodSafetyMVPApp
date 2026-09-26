import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { IsoDate } from "@/domain/dates";
import { AppError } from "@/domain/errors";
import {
  acceptanceImpact,
  checkInsurance,
  detailsKind,
  gfsiRecognized,
  type InsuranceCheck,
  isHighRisk,
  requirementsCoveredBy,
  type VerificationError,
  type VerificationField,
  type VerificationInput,
} from "@/domain/evidence";
import { DEFAULT_REVIEW_POLICY, type ReviewPolicy } from "@/domain/permissions";
import type { ProgramCode, RequirementCode } from "@/domain/programs";
import {
  checkCanAccept,
  checkCanReview,
  type ReviewDecision,
  type ReviewDenial,
  reviewDocument,
} from "@/domain/review";
import type { RequirementStatus } from "@/domain/status";
import {
  type DocumentSubject,
  type FileRef,
  involves,
  type MaterialKind,
  type SupplierDocument,
  type Verification,
} from "@/domain/suppliers";
import { checkUpload, MAX_FILE_BYTES, safeFileName, type UploadError, type UploadField } from "@/domain/upload";
import { documentVersions } from "@/domain/versions";

import { type RequestContext, requirePermission } from "./context";
import { type DocumentRow, evidenceGaps, type GapRow, type ListContext, toDocumentRows } from "./document-list";
import { fileStore } from "./files/store";
import { describeSubject, obligationsOf, onDocumentReviewed } from "./requests";
import { getSampleStore, type SampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";
import { getWorkflowStore } from "./sample/workflow-store";

/*
 * Document service. Reads and changes the in-memory sample store for now; later the
 * same functions run against Postgres. Every change is recorded as an activity event.
 */

/**
 * The company's minimum insurance coverage (the buyer threshold), in US dollars. A company
 * setting; the sample companies use a fictional value so the comparison can be seen.
 */
export const SAMPLE_INSURANCE_MINIMUM_USD = 1_000_000;

function listContext(ctx: RequestContext, store: SampleStore): ListContext {
  return {
    data: store,
    obligations: obligationsOf(store, ctx.today),
    requests: getWorkflowStore(ctx.company.slug, ctx.today).requests,
    users: SAMPLE_USERS,
    today: ctx.today,
  };
}

export async function listDocuments(ctx: RequestContext): Promise<DocumentRow[]> {
  requirePermission(ctx, "documents.view");
  return toDocumentRows(listContext(ctx, getSampleStore(ctx.company.slug, ctx.today)));
}

/** Evidence gaps: obligations with nothing valid behind them (never rows in the document list). */
export async function listEvidenceGaps(ctx: RequestContext): Promise<GapRow[]> {
  requirePermission(ctx, "documents.view");
  return evidenceGaps(listContext(ctx, getSampleStore(ctx.company.slug, ctx.today)));
}

export type ImpactView = {
  code: RequirementCode;
  program: ProgramCode;
  blocking: boolean;
  materials: number;
  before: RequirementStatus;
  after: RequirementStatus;
};

export type DocumentDetail = DocumentRow & {
  /** Whether the expiration comes from the document itself (not the catalog's default validity). */
  printedExpiry: boolean;
  validityMonths: number | null;
  reviewedOn?: IsoDate;
  rejectionReason?: string;
  /** The stored file, if there is one (sample documents have none). */
  file?: Omit<FileRef, "key">;
  /** Why the current user can't accept or reject it; null when they can. */
  reviewDenial: ReviewDenial | null;
  /** Why it can't be accepted even by someone who may review it (it can still be rejected). */
  acceptDenial: "no_file" | null;
  /** Which details the reviewer types in to accept it. */
  detailsKind: "certificate" | "insurance" | null;
  /** What accepting would change, shown before deciding (documents waiting for review only). */
  impact: ImpactView[];
  /** What the reviewer confirmed (accepted documents). */
  verification?: Verification;
  gfsiRecognized: boolean;
  insurance: { minimumUsd: number | null; check: InsuranceCheck | null };
  /** The request item it answers, when sent through a request link. */
  requestItem?: { requestId: string; status: string };
  /** Every version of this document, newest first, including this one. Nothing is ever deleted. */
  versions: DocumentRow[];
};

export async function getDocument(ctx: RequestContext, id: string): Promise<DocumentDetail | null> {
  requirePermission(ctx, "documents.view");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const doc = store.documents.find((d) => d.id === id);
  if (!doc) return null;
  const list = listContext(ctx, store);
  const rows = toDocumentRows(list);
  const row = rows.find((r) => r.id === id)!;
  const versionIds = new Set(documentVersions(doc, store.documents).map((d) => d.id));
  const highRisk = isHighRisk(doc, store.sources, store.sites);
  const requirements = list.obligations.map((o) => o.requirement);
  const details = doc.verification?.details;
  const minimumUsd = SAMPLE_INSURANCE_MINIMUM_USD;
  const item = list.requests.flatMap((r) => r.items.map((i) => ({ r, i }))).find((x) => x.i.id === doc.requestItemId);
  return {
    ...row,
    printedExpiry: Boolean(doc.expiresOn),
    validityMonths: findType(DEFAULT_CATALOG, doc.typeCode)?.validityMonths ?? null,
    reviewedOn: doc.reviewedOn,
    rejectionReason: doc.rejectionReason,
    file: doc.file
      ? { name: doc.file.name, size: doc.file.size, contentType: doc.file.contentType, sha256: doc.file.sha256 }
      : undefined,
    reviewDenial: checkCanReview(ctx.actor, doc, store.policy, highRisk),
    acceptDenial: checkCanAccept(doc),
    detailsKind: detailsKind(doc.typeCode),
    impact:
      doc.state === "pending_review"
        ? acceptanceImpact(doc, requirements, store.documents, DEFAULT_CATALOG, ctx.today).map((x) => ({
            code: x.requirement.code,
            program: x.requirement.program,
            blocking: x.requirement.blocking,
            materials: x.requirement.sourceIds.length,
            before: x.before,
            after: x.after,
          }))
        : [],
    verification: doc.verification,
    gfsiRecognized: details?.kind === "certificate" ? gfsiRecognized(details) : false,
    insurance: {
      minimumUsd,
      check: details?.kind === "insurance" ? checkInsurance(details.coverageUsd, minimumUsd) : null,
    },
    requestItem: item ? { requestId: item.r.id, status: item.i.status } : undefined,
    versions: rows.filter((r) => versionIds.has(r.id)).sort((a, b) => b.version - a.version),
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
  const data = await fileStore().read(doc.file.key);
  return data ? { data, file: doc.file } : null;
}

export type ReviewOutcome =
  | { ok: true; superseded: number }
  | { ok: false; denial: ReviewDenial; errors?: Partial<Record<VerificationField, VerificationError>> };

/**
 * Accepts or rejects a document waiting for review. The decision, the replaced versions, the
 * request item it answers and the activity record change together.
 */
export async function decideDocument(
  ctx: RequestContext,
  id: string,
  decision: ReviewDecision,
  reason: string,
  verification?: VerificationInput,
): Promise<ReviewOutcome> {
  requirePermission(ctx, "documents.review");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const doc = store.documents.find((d) => d.id === id);
  if (!doc) throw new AppError("not_found", "document");

  const perLot = findType(DEFAULT_CATALOG, doc.typeCode)?.perLot ?? false;
  const result = reviewDocument({
    doc,
    others: store.documents,
    actor: ctx.actor,
    decision,
    reason,
    today: ctx.today,
    perLot,
    policy: store.policy,
    highRisk: isHighRisk(doc, store.sources, store.sites),
    verification,
  });
  if (!result.ok) return result;

  const changed = new Map([result.document, ...result.superseded].map((d) => [d.id, d]));
  store.documents = store.documents.map((d) => changed.get(d.id) ?? d);

  const requirements = obligationsOf(store, ctx.today).map((o) => o.requirement);
  const covered = requirementsCoveredBy(result.document, requirements).map((r) => r.key);
  onDocumentReviewed(ctx, result.document, decision, result.document.rejectionReason ?? "", covered);

  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: decision === "accept" ? "document.accepted" : "document.rejected",
    documentId: doc.id,
    partyId: describeSubject(store, doc.subject).partyId,
    detail: decision === "accept" ? String(result.superseded.length) : result.document.rejectionReason,
  });
  return { ok: true, superseded: result.superseded.length };
}

/* Upload */

export type UploadTarget = {
  id: string;
  name: string;
  /** The supplier's plants and warehouses, to file facility documents (certificates, FDA registration) on. */
  sites: { siteId: string; name: string | null; city: string }[];
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
      sites: store.sites.filter((s) => s.partyId === p.id).map((s) => ({ siteId: s.id, name: s.name, city: s.city })),
      materials: store.sources
        .filter((s) => s.qualification.status !== "rejected" && involves(s, p.id))
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
  /** "party" for the supplier's own documents, a site id for a facility's, or a source id for a material's. */
  about: string;
  typeCode: string;
  lotCode: string;
  issuedOn: string;
  expiresOn: string;
  file: File | null;
};

export type UploadOutcome = { ok: true; id: string } | { ok: false; errors: Partial<Record<UploadField, UploadError>> };

/** Files a new document. It enters the review queue and counts for nothing until a reviewer accepts it. */
export async function uploadDocument(ctx: RequestContext, req: UploadRequest): Promise<UploadOutcome> {
  requirePermission(ctx, "documents.upload");
  const store = getSampleStore(ctx.company.slug, ctx.today);

  // The subject must be a real supplier of this company, and the material one it makes or sells.
  const party = store.parties.find((p) => p.id === req.partyId);
  let subject: DocumentSubject | null = null;
  let materialKind: MaterialKind | null = null;
  if (party && req.about === "party") subject = { kind: "party", partyId: party.id };
  else if (party && store.sites.some((s) => s.id === req.about && s.partyId === party.id)) {
    subject = { kind: "site", siteId: req.about };
  } else if (party) {
    const source = store.sources.find((s) => s.id === req.about && involves(s, party.id));
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
  await fileStore().put(key, data!);

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
    receivedVia: "team",
    file: {
      key,
      name,
      size: data!.byteLength,
      contentType: check.fileType,
      sha256: createHash("sha256").update(data!).digest("hex"),
    },
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

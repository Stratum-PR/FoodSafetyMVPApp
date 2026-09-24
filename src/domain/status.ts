import { type DocumentType, findType } from "./catalog";
import { addMonths, daysBetween, type IsoDate } from "./dates";
import type { Requirement } from "./requirements";
import type { DocumentSubject, SupplierDocument } from "./suppliers";

/** Days before expiration when a document starts showing as "expiring". */
export const EXPIRING_WINDOW_DAYS = 30;

/** missing: no accepted document. expired: the best one is past its date. */
export type RequirementStatus = "current" | "expiring" | "expired" | "missing";

/**
 * When a document stops being valid. The printed expiration wins; otherwise the
 * type's validity counts from the issue date (or the date it was received).
 * null = it never expires (per-lot documents, types without validity).
 */
export function expirationOf(doc: SupplierDocument, type: DocumentType | undefined): IsoDate | null {
  if (type?.perLot) return null;
  if (doc.expiresOn) return doc.expiresOn;
  if (!type || type.validityMonths === null) return null;
  return addMonths(doc.issuedOn ?? doc.receivedOn, type.validityMonths);
}

/** Status of one document on `today`. A document is valid through its expiration date. */
export function documentStatus(expiresOn: IsoDate | null, today: IsoDate): Exclude<RequirementStatus, "missing"> {
  if (expiresOn === null) return "current";
  const days = daysBetween(today, expiresOn);
  if (days < 0) return "expired";
  return days <= EXPIRING_WINDOW_DAYS ? "expiring" : "current";
}

function sameSubject(a: DocumentSubject, b: DocumentSubject): boolean {
  if (a.kind === "party" && b.kind === "party") return a.partyId === b.partyId;
  if (a.kind === "source" && b.kind === "source") return a.sourceId === b.sourceId;
  return false;
}

export type RequirementResult = {
  requirement: Requirement;
  status: RequirementStatus;
  /** The document that decides the status (the one valid the longest), if any. */
  document?: SupplierDocument;
  expiresOn?: IsoDate | null;
};

const RANK: Record<RequirementStatus, number> = { current: 3, expiring: 2, expired: 1, missing: 0 };

/** Evaluates a requirement. Only accepted documents count; the best one decides. */
export function evaluateRequirement(
  requirement: Requirement,
  documents: SupplierDocument[],
  catalog: DocumentType[],
  today: IsoDate,
): RequirementResult {
  let best: RequirementResult = { requirement, status: "missing" };

  for (const doc of documents) {
    if (doc.state !== "accepted") continue;
    if (!requirement.anyOf.includes(doc.typeCode)) continue;
    if (!sameSubject(doc.subject, requirement.subject)) continue;

    const expiresOn = expirationOf(doc, findType(catalog, doc.typeCode));
    const status = documentStatus(expiresOn, today);
    const better =
      RANK[status] > RANK[best.status] ||
      (RANK[status] === RANK[best.status] && laterThan(expiresOn, best.document ? best.expiresOn : undefined));
    if (better) best = { requirement, status, document: doc, expiresOn };
  }
  return best;
}

/** null (never expires) is later than any date. */
function laterThan(a: IsoDate | null, b: IsoDate | null | undefined): boolean {
  if (b === undefined) return true;
  if (a === null) return b !== null;
  if (b === null) return false;
  return a > b;
}

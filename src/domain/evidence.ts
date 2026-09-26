import { type DocumentType, findType } from "./catalog";
import type { IsoDate } from "./dates";
import { isIsoDate } from "./dates";
import { can, type Role } from "./permissions";
import type { Requirement } from "./requirements";
import { evaluateRequirement, type RequirementStatus } from "./status";
import {
  type ApprovedSource,
  type CertificateDetails,
  involves,
  sameSubject,
  type Site,
  CHECKLIST_ITEMS,
  type ChecklistItem,
  type EvidenceDetails,
  type InsuranceDetails,
  type SupplierDocument,
  type Verification,
} from "./suppliers";
import { sameRecord } from "./versions";

/*
 * What makes an uploaded document count as evidence. Rules:
 * - Only a document with a stored, hashed file can be accepted. Sample rows without a file are
 *   examples, never proof. (No alternative evidence method is defined yet; see docs.)
 * - The reviewer confirms six checks (identity, facility, scope, dates, issuer, requirement fit).
 * - A GFSI certificate needs its details typed from the document and a check in the scheme
 *   owner's public directory: a PDF or a free-text scheme alone doesn't prove GFSI recognition.
 * - Insurance needs the coverage amount, compared with the company's configured minimum.
 * - High-risk evidence (it covers a high-risk material) needs a final review by a role that
 *   approves suppliers (quality manager, admin, owner).
 */

/**
 * GFSI-recognized certification programmes the app knows. Recognition changes over time, so this
 * list only narrows the choice; the reviewer still confirms the certificate in the scheme
 * owner's directory. Keep in step with GFSI's published list.
 */
export const GFSI_SCHEMES = [
  { code: "sqf", name: "SQF" },
  { code: "brcgs", name: "BRCGS" },
  { code: "fssc22000", name: "FSSC 22000" },
  { code: "ifs", name: "IFS" },
  { code: "globalgap", name: "GLOBALG.A.P. IFA" },
  { code: "primusgfs", name: "PrimusGFS" },
  { code: "canadagap", name: "CanadaGAP" },
  { code: "gsa_bap", name: "GSA / BAP" },
] as const;

export const OTHER_SCHEME = "other";
export const TEXT_MAX = 200;

/** Document types whose details the reviewer types in: certificates and insurance. */
export function detailsKind(typeCode: string): EvidenceDetails["kind"] | null {
  if (typeCode === "gfsi_cert") return "certificate";
  if (typeCode === "insurance") return "insurance";
  return null;
}

/** Recognized only when the scheme is on the list and a person checked the directory. */
export function gfsiRecognized(details: CertificateDetails | undefined): boolean {
  return Boolean(details?.directoryVerified && GFSI_SCHEMES.some((s) => s.code === details.scheme));
}

export type InsuranceCheck = "meets" | "below" | "no_threshold";

export function checkInsurance(coverageUsd: number, minimumUsd: number | null): InsuranceCheck {
  if (minimumUsd === null) return "no_threshold";
  return coverageUsd >= minimumUsd ? "meets" : "below";
}

/* The reviewer's input, straight from the form: nothing is trusted. */

export type VerificationInput = {
  checklist: string[];
  scheme?: string;
  scope?: string;
  issuingBody?: string;
  certificateNumber?: string;
  facility?: string;
  auditDate?: string;
  directoryVerified?: boolean;
  insurer?: string;
  policyNumber?: string;
  coverageUsd?: string;
};

export type VerificationField =
  | "checklist"
  | "scheme"
  | "scope"
  | "issuingBody"
  | "certificateNumber"
  | "facility"
  | "auditDate"
  | "directoryVerified"
  | "insurer"
  | "policyNumber"
  | "coverageUsd";

export type VerificationError =
  "required" | "too_long" | "invalid_date" | "future_date" | "not_recognized" | "invalid_amount" | "incomplete";

export type VerificationCheck =
  | { ok: true; verification: Verification }
  | { ok: false; errors: Partial<Record<VerificationField, VerificationError>> };

/** Validates what the reviewer confirmed for accepting a document of this type. */
export function checkVerification(typeCode: string, input: VerificationInput, today: IsoDate): VerificationCheck {
  const errors: Partial<Record<VerificationField, VerificationError>> = {};
  const checklist = CHECKLIST_ITEMS.filter((item) => input.checklist.includes(item));
  if (checklist.length !== CHECKLIST_ITEMS.length) errors.checklist = "incomplete";

  const text = (field: VerificationField, value: string | undefined): string => {
    const v = (value ?? "").trim();
    if (!v) errors[field] = "required";
    else if (v.length > TEXT_MAX) errors[field] = "too_long";
    return v;
  };

  let details: EvidenceDetails | undefined;
  const kind = detailsKind(typeCode);
  if (kind === "certificate") {
    const scheme = (input.scheme ?? "").trim();
    if (!scheme) errors.scheme = "required";
    // A GFSI certificate must be from a recognized scheme; "other" is not one.
    else if (!GFSI_SCHEMES.some((s) => s.code === scheme)) errors.scheme = "not_recognized";
    const auditDate = (input.auditDate ?? "").trim();
    if (auditDate && !isIsoDate(auditDate)) errors.auditDate = "invalid_date";
    else if (auditDate > today) errors.auditDate = "future_date";
    if (!input.directoryVerified) errors.directoryVerified = "required";
    details = {
      kind,
      scheme,
      scope: text("scope", input.scope),
      issuingBody: text("issuingBody", input.issuingBody),
      certificateNumber: text("certificateNumber", input.certificateNumber),
      facility: text("facility", input.facility),
      auditDate: auditDate || undefined,
      directoryVerified: Boolean(input.directoryVerified),
    } satisfies CertificateDetails;
  } else if (kind === "insurance") {
    const raw = (input.coverageUsd ?? "").replace(/[$,\s]/g, "");
    const amount = /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
    if (!raw) errors.coverageUsd = "required";
    else if (!Number.isSafeInteger(amount) || amount <= 0) errors.coverageUsd = "invalid_amount";
    details = {
      kind,
      insurer: text("insurer", input.insurer),
      policyNumber: text("policyNumber", input.policyNumber),
      coverageUsd: amount,
    } satisfies InsuranceDetails;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, verification: { checklist: checklist as ChecklistItem[], details } };
}

/* Which requirements a document covers, and how risky it is. */

/** Requirements this document would satisfy once accepted: same subject, and one of the types asked. */
export function requirementsCoveredBy(doc: SupplierDocument, requirements: Requirement[]): Requirement[] {
  return requirements.filter((r) => r.anyOf.includes(doc.typeCode) && sameSubject(doc.subject, r.subject));
}

/**
 * High risk when the document covers a high-risk material that is bought today: it's filed on a
 * high-risk active source, on the site that makes one, or on a supplier that makes or sells one.
 */
export function isHighRisk(doc: SupplierDocument, sources: ApprovedSource[], sites: Site[]): boolean {
  const risky = sources.filter((s) => s.commercial === "active" && s.risk === "high");
  const subject = doc.subject;
  if (subject.kind === "source") return risky.some((s) => s.id === subject.sourceId);
  if (subject.kind === "site") {
    const partyId = sites.find((x) => x.id === subject.siteId)?.partyId;
    return risky.some((s) => s.siteId === subject.siteId || (partyId !== undefined && s.distributorId === partyId));
  }
  return risky.some((s) => involves(s, subject.partyId));
}

/** Roles that give the final review on high-risk evidence. */
export function canGiveFinalReview(role: Role): boolean {
  return can(role, "suppliers.approve");
}

/**
 * urgent: it would fill a missing or expired requirement on a high-risk material.
 * high: it would fill a missing or expired requirement, or it's high risk.
 * normal: everything else (e.g. an early renewal).
 */
export type ReviewPriority = "urgent" | "high" | "normal";
export const PRIORITY_RANK: Record<ReviewPriority, number> = { urgent: 0, high: 1, normal: 2 };

export function reviewPriority(blocking: boolean, highRisk: boolean): ReviewPriority {
  if (blocking && highRisk) return "urgent";
  return blocking || highRisk ? "high" : "normal";
}

/** Whether accepting this document would fill a requirement that's missing or expired today. */
export function isBlocking(
  doc: SupplierDocument,
  requirements: Requirement[],
  documents: SupplierDocument[],
  catalog: DocumentType[],
  today: IsoDate,
): boolean {
  return requirementsCoveredBy(doc, requirements).some((r) => {
    const status = evaluateRequirement(r, documents, catalog, today).status;
    return status === "missing" || status === "expired";
  });
}

export type ImpactRow = { requirement: Requirement; before: RequirementStatus; after: RequirementStatus };

/**
 * What accepting this document would change, shown before the reviewer decides: each requirement
 * it covers, with its status now and after. Accepting also replaces the previous accepted
 * version of the same record (never other suppliers', materials' or lots' documents).
 */
export function acceptanceImpact(
  doc: SupplierDocument,
  requirements: Requirement[],
  documents: SupplierDocument[],
  catalog: DocumentType[],
  today: IsoDate,
): ImpactRow[] {
  const perLot = findType(catalog, doc.typeCode)?.perLot ?? false;
  const after = documents.map((d): SupplierDocument => {
    if (d.id === doc.id) return { ...d, state: "accepted" };
    if (!perLot && d.state === "accepted" && sameRecord(d, doc)) return { ...d, state: "superseded" };
    return d;
  });
  if (!after.some((d) => d.id === doc.id)) after.push({ ...doc, state: "accepted" });
  return requirementsCoveredBy(doc, requirements).map((requirement) => ({
    requirement,
    before: evaluateRequirement(requirement, documents, catalog, today).status,
    after: evaluateRequirement(requirement, after, catalog, today).status,
  }));
}

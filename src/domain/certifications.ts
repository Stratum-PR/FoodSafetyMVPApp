import { type DocumentType, findType } from "./catalog";
import type { IsoDate } from "./dates";
import type { Obligation } from "./obligations";
import { documentStatus, expirationOf } from "./status";
import type { CertificateDetails, Site, SupplierDocument } from "./suppliers";

/*
 * Facility certification, per site. A certificate belongs to one plant or warehouse: a
 * certificate for site A says nothing about site B. And a PDF alone doesn't certify anyone:
 * a site is "verified" only when an accepted certificate has its details typed by the reviewer
 * (scheme, scope, issuing body, number) and the reviewer confirmed it in the scheme owner's
 * directory. Recognition of the scheme by GFSI is judged in evidence.ts, not here.
 *
 *   verified              accepted, details recorded, directory checked, valid > 30 days
 *   expiring              the same, expiring within 30 days
 *   expired               the best accepted certificate is past its date
 *   pending_verification  accepted certificate without recorded details or directory check, or one waiting for review
 *   audit_only            no certificate, but an accepted on-site audit covers the site's requirement
 *   missing               the site must show certification or an audit, and has neither
 *   not_assessed          nothing is bought from this site, so nothing is required or known
 */

export type CertificationStatus =
  "verified" | "expiring" | "expired" | "pending_verification" | "audit_only" | "missing" | "not_assessed";

export type SiteCertification = {
  siteId: string;
  status: CertificationStatus;
  /** The certificate that decides the status, if any. */
  document?: SupplierDocument;
  details?: CertificateDetails;
  expiresOn?: IsoDate | null;
  /** Whether the site has an active facility-certification obligation. */
  required: boolean;
};

function certificateDetails(doc: SupplierDocument): CertificateDetails | undefined {
  const details = doc.verification?.details;
  return details?.kind === "certificate" ? details : undefined;
}

/** Certification of one site on `today`. */
export function siteCertification(
  site: Pick<Site, "id">,
  documents: SupplierDocument[],
  obligations: Obligation[],
  catalog: DocumentType[],
  today: IsoDate,
): SiteCertification {
  const onSite = documents.filter((d) => d.subject.kind === "site" && d.subject.siteId === site.id);
  const obligation = obligations.find(
    (o) =>
      o.requirement.code === "facility_certification" &&
      o.requirement.subject.kind === "site" &&
      o.requirement.subject.siteId === site.id,
  );
  const required = Boolean(obligation);
  const certs = onSite
    .filter((d) => d.typeCode === "gfsi_cert" && d.state === "accepted")
    .map((d) => ({ d, expiresOn: expirationOf(d, findType(catalog, d.typeCode)) }))
    .sort((a, b) => (b.expiresOn ?? "9999").localeCompare(a.expiresOn ?? "9999"));
  const best = certs[0];

  if (best) {
    const details = certificateDetails(best.d);
    const base = { siteId: site.id, document: best.d, details, expiresOn: best.expiresOn, required };
    const status = documentStatus(best.expiresOn, today);
    if (status === "expired") return { ...base, status: "expired" };
    if (!details?.directoryVerified) return { ...base, status: "pending_verification" };
    return { ...base, status: status === "expiring" ? "expiring" : "verified" };
  }
  const waiting = onSite.find((d) => d.typeCode === "gfsi_cert" && d.state === "pending_review");
  if (waiting) return { siteId: site.id, status: "pending_verification", document: waiting, required };
  const audit = onSite.some(
    (d) =>
      d.typeCode === "audit_report" &&
      d.state === "accepted" &&
      documentStatus(expirationOf(d, findType(catalog, d.typeCode)), today) !== "expired",
  );
  if (audit) return { siteId: site.id, status: "audit_only", required };
  return { siteId: site.id, status: required ? "missing" : "not_assessed", required };
}

/** Worst first: what the supplier list shows for a company with several sites. */
const ORDER: CertificationStatus[] = [
  "missing",
  "expired",
  "pending_verification",
  "expiring",
  "audit_only",
  "verified",
  "not_assessed",
];

export type CertificationSummary = {
  /** The worst status among the sites that matter (required ones; all sites if none is required). */
  status: CertificationStatus;
  /** Sites with an active certification requirement. */
  required: number;
  /** Of those, how many are verified or expiring (still valid). */
  verified: number;
  /** The site that decides the status. */
  site?: SiteCertification;
};

export function summarizeCertification(sites: SiteCertification[]): CertificationSummary {
  const required = sites.filter((s) => s.required);
  const considered = required.length ? required : sites;
  const worst = [...considered].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))[0];
  return {
    status: worst?.status ?? "not_assessed",
    required: required.length,
    verified: required.filter((s) => s.status === "verified" || s.status === "expiring").length,
    site: worst,
  };
}

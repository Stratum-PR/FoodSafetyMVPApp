import type { IsoDate } from "./dates";

/*
 * Supplier model (agreed 24 September 2026, from the first design partner's procedures and FDA/SQF):
 * - FDA's "supplier" is the establishment that manufactures the food (21 CFR 117.3). SQF and
 *   BRCGS still expect the distributor you buy from to be controlled.
 * - So a party is a manufacturer, a distributor, or both; and an approved source is
 *   ingredient + manufacturer site + distributor (no distributor when bought direct).
 * - A party is one company (the plan's `parties` table); its plants and warehouses are `sites`.
 *   Certificates, FDA registration (FEI) and GLN belong to a site, not to the company.
 */

export type PartyType = "manufacturer" | "distributor" | "both";

/** request: we ask them for documents (suppliers). deliver: we send them ours (buyers). */
export type PartyDirection = "request" | "deliver";

/** Where the party is in the approval process. */
export type Lifecycle = "onboarding" | "verification" | "monitoring" | "suspended" | "inactive";

/** The quality decision on the party. rejected = disqualified: not approved and not bought from. */
export type Approval = "pending" | "approved" | "conditional" | "suspended" | "rejected";

/** Restrictions a conditional approval can put on receiving. */
export const RESTRICTIONS = ["coa_every_lot", "inspect_every_lot", "no_new_materials"] as const;
export type Restriction = (typeof RESTRICTIONS)[number];

/** The terms of the current approval: when it's reviewed again and, if conditional, on what conditions. */
export type ApprovalTerms = {
  /** When the approval (or its conditions) must be reviewed again. */
  reviewBy?: IsoDate;
  /** Conditional only: what the supplier must do. */
  conditions?: string;
  /** Conditional only: who follows the conditions up (a user id). */
  owner?: string;
  /** Conditional only: from when the conditional approval applies. */
  effectiveOn?: IsoDate;
  /** Conditional only: the sources (site + material) it may supply. Empty = all its active ones. */
  allowedSourceIds?: string[];
  restrictions?: Restriction[];
};

export type Party = {
  id: string;
  name: string;
  type: PartyType;
  direction: PartyDirection;
  /**
   * Legacy location, from before sites existed. The party's legacy site carries the same
   * values (see legacySite); screens read sites.
   */
  city: string;
  /** ISO 3166 alpha-2. Puerto Rico is "PR". */
  country: string;
  /** Legacy FDA Establishment Identifier, when known. Now kept on the site. */
  fei?: string;
  lifecycle: Lifecycle;
  approval: Approval;
  terms?: ApprovalTerms;
  /** User who added the party. Used for separation of duties on approval. */
  createdBy: string;
};

export type SiteKind = "plant" | "warehouse" | "distribution_center" | "farm" | "office";

/** A plant, warehouse, farm or DC of a party. */
export type Site = {
  id: string;
  partyId: string;
  /** null for a legacy site whose name was never recorded. */
  name: string | null;
  /** null when nobody has said what kind of site it is. */
  kind: SiteKind | null;
  address?: string;
  city: string;
  country: string;
  /** FDA Establishment Identifier. */
  fei?: string;
  /** GS1 Global Location Number (13 digits). */
  gln?: string;
  /** Created from the party's old location fields, not entered by a person. */
  legacy: boolean;
};

/**
 * The site every existing party gets when sites are introduced: the old city, country and
 * FEI moved as they were. Nothing is invented: no name, no kind, no address.
 */
export function legacySite(party: Pick<Party, "id" | "city" | "country" | "fei">): Site {
  return {
    id: `${party.id}-site-legacy`,
    partyId: party.id,
    name: null,
    kind: null,
    city: party.city,
    country: party.country,
    fei: party.fei,
    legacy: true,
  };
}

export type ContactRole = "food_safety" | "regulatory" | "sales" | "accounts";

/**
 * A person at a party. Their language decides the language of emails and the request link.
 * Same shape as the supplier-qualification branch's Contact, plus the reminder opt-out.
 */
export type Contact = {
  id: string;
  partyId: string;
  /** The site they work at, when it matters. */
  siteId?: string;
  name: string;
  email: string;
  phone?: string;
  language: "es" | "en";
  role: ContactRole;
  isPrimary: boolean;
  /** The contact asked not to get reminder emails (requests themselves are still sent). */
  remindersOptOut?: boolean;
};

export type MaterialKind = "ingredient" | "packaging";

/** A raw material or packaging the company buys (not a finished product: those are the plan's `items`). */
export type Material = {
  id: string;
  name: string;
  /** The company's internal code. */
  code: string;
  kind: MaterialKind;
  /**
   * Whether it's a food on FDA's Food Traceability List (FSMA 204). undefined = nobody has
   * checked yet; never assumed either way.
   */
  onFtl?: boolean;
};

export type Risk = "low" | "medium" | "high";

/** Commercial status: whether the company buys it today. Says nothing about food safety. */
export type CommercialStatus = "active" | "inactive";

/** The food-safety decision on one source, separate from whether it's bought. */
export type QualificationStatus = "not_assessed" | "pending" | "approved" | "conditional" | "suspended" | "rejected";

/** How COAs are checked at receiving for a source. not_set = no policy recorded. */
export type CoaPolicy = "not_set" | "every_lot" | "periodic" | "not_required";

export type SourceQualification = {
  status: QualificationStatus;
  decidedBy?: string;
  decidedOn?: IsoDate;
  rationale?: string;
  /** Conditional: when it's reviewed again. */
  reviewBy?: IsoDate;
  /** Conditional: what the restriction is (e.g. hold each lot until the COA is checked). */
  restrictions?: string;
};

/** One way a material reaches the company: who makes it (at which site) and who sells it. */
export type ApprovedSource = {
  id: string;
  materialId: string;
  manufacturerId: string;
  /** The manufacturer's site the material comes from. */
  siteId: string;
  /** null when bought directly from the manufacturer. */
  distributorId: string | null;
  commercial: CommercialStatus;
  qualification: SourceQualification;
  /** The material's inherent hazard, shown as the material risk (not the supplier's). */
  risk: Risk;
  /** The agreed specification (reference or version), when recorded. */
  specification?: string;
  coaPolicy: CoaPolicy;
};

/**
 * A source as it was stored before sites and qualification existed. Its old status mixed
 * two things; backfillSource splits them without inventing an approval.
 */
export type LegacySource = {
  id: string;
  materialId: string;
  manufacturerId: string;
  distributorId: string | null;
  status: "active" | "inactive" | "rejected";
  risk: Risk;
};

/**
 * Old "active"/"inactive" was only whether it's bought: the qualification stays not assessed
 * (never implicitly approved). Old "rejected" was an explicit refusal: not bought, rejected.
 */
export function backfillSource(legacy: LegacySource, siteId: string): ApprovedSource {
  return {
    id: legacy.id,
    materialId: legacy.materialId,
    manufacturerId: legacy.manufacturerId,
    siteId,
    distributorId: legacy.distributorId,
    commercial: legacy.status === "active" ? "active" : "inactive",
    qualification: { status: legacy.status === "rejected" ? "rejected" : "not_assessed" },
    risk: legacy.risk,
    coaPolicy: "not_set",
  };
}

/** Only accepted documents count toward requirements. */
export type DocumentState = "pending_review" | "accepted" | "rejected" | "superseded";

/** What a document is about: a whole company, one of its sites, or one source (material). */
export type DocumentSubject =
  { kind: "party"; partyId: string } | { kind: "site"; siteId: string } | { kind: "source"; sourceId: string };

export function sameSubject(a: DocumentSubject, b: DocumentSubject): boolean {
  if (a.kind === "party" && b.kind === "party") return a.partyId === b.partyId;
  if (a.kind === "site" && b.kind === "site") return a.siteId === b.siteId;
  if (a.kind === "source" && b.kind === "source") return a.sourceId === b.sourceId;
  return false;
}

export function subjectKey(subject: DocumentSubject): string {
  if (subject.kind === "party") return `party:${subject.partyId}`;
  if (subject.kind === "site") return `site:${subject.siteId}`;
  return `source:${subject.sourceId}`;
}

export type SupplierDocument = {
  id: string;
  typeCode: string;
  subject: DocumentSubject;
  state: DocumentState;
  receivedOn: IsoDate;
  issuedOn?: IsoDate;
  /** The expiration printed on the document, when it has one. */
  expiresOn?: IsoDate;
  /** For per-lot documents such as a COA. */
  lotCode?: string;
  uploadedBy: string;
  /** Set when the document is accepted or rejected. */
  reviewedBy?: string;
  reviewedOn?: IsoDate;
  /** The stored file. Sample documents have none. */
  file?: FileRef;
  /** Required when rejected; shown to whoever uploads the replacement. */
  rejectionReason?: string;
  /** How it arrived: a team member's upload (default) or the supplier's request link. */
  receivedVia?: "team" | "portal";
  /** The request item it answers, when the supplier sent it through a request link. */
  requestItemId?: string;
  /** What the reviewer confirmed when accepting it (see evidence.ts). */
  verification?: Verification;
};

/** The reviewer's record of what they checked and the details they read off the document. */
export type Verification = {
  checklist: readonly ChecklistItem[];
  details?: EvidenceDetails;
};

/** Every box must be checked to accept (see evidence.ts). */
export const CHECKLIST_ITEMS = ["identity", "facility", "scope", "dates", "issuer", "requirement_fit"] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

/** Certificate details, typed by a person from the document (GFSI certificates). */
export type CertificateDetails = {
  kind: "certificate";
  /** A GFSI-recognized scheme code (evidence.ts). Anything else never counts as GFSI recognition. */
  scheme: string;
  scope: string;
  issuingBody: string;
  certificateNumber: string;
  /** The facility named on the certificate (name and address as printed). */
  facility: string;
  auditDate?: IsoDate;
  /** The reviewer found the certificate in the scheme owner's public directory. */
  directoryVerified: boolean;
};

/** Insurance details, typed by a person from the certificate of insurance. */
export type InsuranceDetails = {
  kind: "insurance";
  insurer: string;
  policyNumber: string;
  /** Per-occurrence general liability coverage, in whole US dollars. */
  coverageUsd: number;
};

export type EvidenceDetails = CertificateDetails | InsuranceDetails;

/** Manufacturers outside the US (Puerto Rico counts as US) fall under FSVP (21 CFR 1 subpart L). */
export function isForeign(party: Pick<Party, "country">): boolean {
  return !["US", "PR"].includes(party.country.toUpperCase());
}

/** The party the company buys from: the distributor, or the manufacturer when bought direct. */
export function vendorOf(source: Pick<ApprovedSource, "manufacturerId" | "distributorId">): string {
  return source.distributorId ?? source.manufacturerId;
}

/** Whether a source involves a party, as its manufacturer or its distributor. */
export function involves(source: Pick<ApprovedSource, "manufacturerId" | "distributorId">, partyId: string): boolean {
  return source.manufacturerId === partyId || source.distributorId === partyId;
}

/** A stored document file. `key` locates it in storage; `name` is the safe download name. */
export type FileRef = {
  key: string;
  name: string;
  size: number;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  /** SHA-256 of the bytes, hex. Proves later that the file is the one that was reviewed. */
  sha256?: string;
};

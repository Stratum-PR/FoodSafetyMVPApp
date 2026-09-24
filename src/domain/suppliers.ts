import type { IsoDate } from "./dates";

/*
 * Supplier model (agreed 24 September 2026, from the first design partner's procedures and FDA/SQF):
 * - FDA's "supplier" is the establishment that manufactures the food (21 CFR 117.3). SQF and
 *   BRCGS still expect the distributor you buy from to be controlled.
 * - So a party is a manufacturer, a distributor, or both; and an approved source is
 *   ingredient + manufacturer + distributor (no distributor when bought direct).
 */

export type PartyType = "manufacturer" | "distributor" | "both";

/** Where the party is in the approval process. */
export type Lifecycle = "onboarding" | "verification" | "monitoring" | "suspended" | "inactive";

/** The quality decision on the party. */
export type Approval = "pending" | "approved" | "conditional" | "suspended";

export type Party = {
  id: string;
  name: string;
  type: PartyType;
  city: string;
  /** ISO 3166 alpha-2. Puerto Rico is "PR". */
  country: string;
  /** FDA Establishment Identifier, when known. */
  fei?: string;
  lifecycle: Lifecycle;
  approval: Approval;
  /** User who added the party. Used for separation of duties on approval. */
  createdBy: string;
};

export type MaterialKind = "ingredient" | "packaging";

export type Material = {
  id: string;
  name: string;
  /** The company's internal code. */
  code: string;
  kind: MaterialKind;
};

export type Risk = "low" | "medium" | "high";

/** active: bought today. inactive: not bought now. rejected: not approved for this material. */
export type SourceStatus = "active" | "inactive" | "rejected";

/** One way a material reaches the company: who makes it and who sells it. */
export type ApprovedSource = {
  id: string;
  materialId: string;
  manufacturerId: string;
  /** null when bought directly from the manufacturer. */
  distributorId: string | null;
  status: SourceStatus;
  risk: Risk;
};

/** Only accepted documents count toward requirements. */
export type DocumentState = "pending_review" | "accepted" | "rejected" | "superseded";

export type DocumentSubject = { kind: "party"; partyId: string } | { kind: "source"; sourceId: string };

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
  /** Required when rejected; shown to whoever uploads the replacement. */
  rejectionReason?: string;
};

/** Manufacturers outside the US (Puerto Rico counts as US) fall under FSVP (21 CFR 1 subpart L). */
export function isForeign(party: Pick<Party, "country">): boolean {
  return !["US", "PR"].includes(party.country.toUpperCase());
}

/** The party the company buys from: the distributor, or the manufacturer when bought direct. */
export function vendorOf(source: Pick<ApprovedSource, "manufacturerId" | "distributorId">): string {
  return source.distributorId ?? source.manufacturerId;
}

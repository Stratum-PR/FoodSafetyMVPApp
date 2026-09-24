import { type ApprovedSource, type DocumentSubject, isForeign, type Material, type Party, vendorOf } from "./suppliers";

/*
 * Which documents each active approved source needs. Default rules:
 * - Manufacturer: GFSI certificate or an on-site audit, questionnaire, FDA registration.
 *   Foreign manufacturer (FSVP, 21 CFR 1.504): also a hazard analysis.
 * - Vendor (the party the company buys from): guarantee letter and insurance. When bought
 *   direct, these land on the manufacturer.
 * - Distributor: GFSI certificate or an on-site audit, and the questionnaire (SQF 2.4.4).
 * - Per source: spec sheet; allergen statement for ingredients; food-contact letter for packaging.
 * COAs are per lot and are not an approval requirement.
 */

export type RequirementReason = "manufacturer" | "vendor" | "distributor" | "fsvp" | "ingredient" | "packaging";

export type Requirement = {
  /** Stable key: subject + accepted codes. The same party requirement is counted once. */
  key: string;
  subject: DocumentSubject;
  /** Any one accepted, valid document of these types satisfies the requirement. */
  anyOf: readonly string[];
  reason: RequirementReason;
};

function subjectKey(subject: DocumentSubject): string {
  return subject.kind === "party" ? `party:${subject.partyId}` : `source:${subject.sourceId}`;
}

function req(subject: DocumentSubject, anyOf: readonly string[], reason: RequirementReason): Requirement {
  return { key: `${subjectKey(subject)}|${anyOf.join("+")}`, subject, anyOf, reason };
}

/** Requirements for one approved source. */
export function requirementsForSource(
  source: ApprovedSource,
  material: Material,
  manufacturer: Party,
  distributor: Party | null,
): Requirement[] {
  const m: DocumentSubject = { kind: "party", partyId: manufacturer.id };
  const s: DocumentSubject = { kind: "source", sourceId: source.id };
  const vendor: DocumentSubject = { kind: "party", partyId: vendorOf(source) };

  const list: Requirement[] = [
    req(m, ["gfsi_cert", "audit_report"], "manufacturer"),
    req(m, ["questionnaire"], "manufacturer"),
    req(m, ["fda_registration"], "manufacturer"),
  ];
  if (isForeign(manufacturer)) list.push(req(m, ["hazard_analysis"], "fsvp"));

  if (distributor) {
    const d: DocumentSubject = { kind: "party", partyId: distributor.id };
    list.push(req(d, ["gfsi_cert", "audit_report"], "distributor"), req(d, ["questionnaire"], "distributor"));
  }
  list.push(req(vendor, ["guarantee_letter"], "vendor"), req(vendor, ["insurance"], "vendor"));

  list.push(req(s, ["spec_sheet"], material.kind));
  list.push(req(s, [material.kind === "ingredient" ? "allergen_statement" : "packaging_compliance"], material.kind));
  return list;
}

export type SupplierData = {
  parties: Party[];
  materials: Material[];
  sources: ApprovedSource[];
};

/**
 * Requirements for every active source, without duplicates. Inactive and rejected
 * sources don't count: nothing is bought through them.
 */
export function allRequirements(data: SupplierData): Requirement[] {
  const parties = new Map(data.parties.map((p) => [p.id, p]));
  const materials = new Map(data.materials.map((m) => [m.id, m]));
  const byKey = new Map<string, Requirement>();

  for (const source of data.sources) {
    if (source.status !== "active") continue;
    const material = materials.get(source.materialId);
    const manufacturer = parties.get(source.manufacturerId);
    const distributor = source.distributorId ? parties.get(source.distributorId) : null;
    if (!material || !manufacturer || distributor === undefined) {
      throw new Error(`Approved source ${source.id} points to a missing material or party`);
    }
    for (const r of requirementsForSource(source, material, manufacturer, distributor)) {
      if (!byKey.has(r.key)) byKey.set(r.key, r);
    }
  }
  return [...byKey.values()];
}

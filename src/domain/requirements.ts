import {
  CATALOG_VERSION,
  DEFAULT_REQUIREMENT_POLICY,
  findRequirement,
  isBlocking,
  type ProgramCode,
  REQUIREMENTS,
  type RequirementCode,
  type RequirementDef,
  type RequirementPolicy,
  type RequirementSeverity,
} from "./programs";
import {
  type ApprovedSource,
  type DocumentSubject,
  isForeign,
  type Material,
  type Party,
  type Site,
  subjectKey,
  vendorOf,
} from "./suppliers";

/*
 * Which evidence each actively bought source needs (the plan's obligations). Default rules:
 * - Manufacturer site: GFSI certificate or an on-site audit, and FDA registration.
 *   Manufacturer company: questionnaire. Foreign manufacturer (FSVP, 21 CFR 1.504): hazard analysis.
 * - Vendor (the party the company buys from): guarantee letter and insurance. When bought
 *   direct, these land on the manufacturer.
 * - Distributor: GFSI certificate or an on-site audit at its main site, and the questionnaire (SQF 2.4.4).
 * - Per source: spec sheet; allergen statement for ingredients; food-contact letter for packaging.
 * COAs are per lot and are not an approval requirement.
 * Only commercially active sources generate obligations: nothing is required of what isn't bought.
 */

export type RequirementReason = "manufacturer" | "vendor" | "distributor" | "fsvp" | "ingredient" | "packaging";

export type Requirement = {
  /** Stable key: subject + requirement. The same requirement on the same subject is counted once. */
  key: string;
  subject: DocumentSubject;
  /** Any one accepted, valid document of these types satisfies the requirement. */
  anyOf: readonly string[];
  reason: RequirementReason;
  code: RequirementCode;
  program: ProgramCode;
  severity: RequirementSeverity;
  /** An unmet blocking requirement stops a full approval. */
  blocking: boolean;
  /** The catalog version the rule comes from. */
  ruleVersion: string;
  /** "Applies because": the active sources (material + site) that bring it in. */
  sourceIds: string[];
};

function make(
  def: RequirementDef,
  subject: DocumentSubject,
  reason: RequirementReason,
  sourceId: string,
  policy: RequirementPolicy,
): Requirement {
  return {
    key: `${subjectKey(subject)}|${def.code}`,
    subject,
    anyOf: def.anyOf,
    reason,
    code: def.code,
    program: def.program,
    severity: def.severity,
    blocking: isBlocking(def, policy),
    ruleVersion: def.version,
    sourceIds: [sourceId],
  };
}

export type SourceContext = {
  source: ApprovedSource;
  material: Material;
  manufacturer: Party;
  distributor: Party | null;
  /** The distributor's main site (its facility evidence lives there). */
  distributorSiteId: string | null;
};

/** Requirements for one source. */
export function requirementsForSource(
  { source, material, manufacturer, distributor, distributorSiteId }: SourceContext,
  catalog: RequirementDef[] = REQUIREMENTS,
  policy: RequirementPolicy = DEFAULT_REQUIREMENT_POLICY,
): Requirement[] {
  const def = (code: RequirementCode) => findRequirement(catalog, code);
  const add = (code: RequirementCode, subject: DocumentSubject, reason: RequirementReason) =>
    make(def(code), subject, reason, source.id, policy);

  const company: DocumentSubject = { kind: "party", partyId: manufacturer.id };
  const plant: DocumentSubject = { kind: "site", siteId: source.siteId };
  const vendor: DocumentSubject = { kind: "party", partyId: vendorOf(source) };
  const self: DocumentSubject = { kind: "source", sourceId: source.id };

  const list: Requirement[] = [
    add("facility_certification", plant, "manufacturer"),
    add("facility_registration", plant, "manufacturer"),
    add("questionnaire", company, "manufacturer"),
  ];
  if (isForeign(manufacturer)) list.push(add("fsvp_hazard_analysis", company, "fsvp"));

  if (distributor) {
    if (distributorSiteId) {
      list.push(add("facility_certification", { kind: "site", siteId: distributorSiteId }, "distributor"));
    }
    list.push(add("questionnaire", { kind: "party", partyId: distributor.id }, "distributor"));
  }
  list.push(add("guarantee_letter", vendor, "vendor"), add("insurance", vendor, "vendor"));

  list.push(add("specification", self, material.kind));
  list.push(add(material.kind === "ingredient" ? "allergen_statement" : "food_contact", self, material.kind));
  return list;
}

export type SupplierData = {
  parties: Party[];
  sites: Site[];
  materials: Material[];
  sources: ApprovedSource[];
};

/** A party's main site: the first one listed (every party has at least its legacy site). */
export function mainSiteOf(sites: Site[], partyId: string): Site | undefined {
  return sites.find((s) => s.partyId === partyId);
}

/**
 * Requirements for every active source, without duplicates. When several sources bring the
 * same requirement, it's listed once with all of them as the reason. Inactive sources don't
 * count: nothing is bought through them.
 */
export function allRequirements(
  data: SupplierData,
  catalog: RequirementDef[] = REQUIREMENTS,
  policy: RequirementPolicy = DEFAULT_REQUIREMENT_POLICY,
): Requirement[] {
  const parties = new Map(data.parties.map((p) => [p.id, p]));
  const materials = new Map(data.materials.map((m) => [m.id, m]));
  const byKey = new Map<string, Requirement>();

  for (const source of data.sources) {
    if (source.commercial !== "active") continue;
    const material = materials.get(source.materialId);
    const manufacturer = parties.get(source.manufacturerId);
    const distributor = source.distributorId ? parties.get(source.distributorId) : null;
    if (!material || !manufacturer || distributor === undefined) {
      throw new Error(`Approved source ${source.id} points to a missing material or party`);
    }
    const distributorSiteId = distributor ? (mainSiteOf(data.sites, distributor.id)?.id ?? null) : null;
    const context = { source, material, manufacturer, distributor, distributorSiteId };
    for (const r of requirementsForSource(context, catalog, policy)) {
      const seen = byKey.get(r.key);
      if (!seen) byKey.set(r.key, r);
      else if (!seen.sourceIds.includes(source.id)) seen.sourceIds.push(source.id);
    }
  }
  return [...byKey.values()];
}

/** The rule set a decision was taken under, for the record. */
export function currentRuleVersion(): string {
  return CATALOG_VERSION;
}

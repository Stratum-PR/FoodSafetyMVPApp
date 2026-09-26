import type { LocalizedText } from "./catalog";

/*
 * The requirement catalog as data (the plan's programs, requirements and program_requirements).
 * A program is a reason to ask for evidence; a requirement is what is asked, of whom, and
 * how serious a gap is. Changing a row here is a new rule version: obligations and decisions
 * record the version they were made under, so an old decision is never rewritten.
 *
 * Scope of this catalog: what a food company asks of its suppliers. The company's own
 * Walmart readiness (the Passport) is a different set of obligations, not listed here.
 */

/** The date the current rule set took effect. Recorded on obligations and approval decisions. */
export const CATALOG_VERSION = "2026-09-26";

export type ProgramCode = "supplier_program" | "fsma_core";

export type SourceLink = { label: string; url: string };

export type Program = {
  code: ProgramCode;
  name: LocalizedText;
  /** stratum: maintained by Stratum, read-only for customers. org: the company's own. */
  owner: "stratum" | "org";
  sources: SourceLink[];
};

export const PROGRAMS: Program[] = [
  {
    code: "supplier_program",
    name: { es: "Programa de aprobación de suplidores", en: "Supplier approval program" },
    owner: "org",
    sources: [
      {
        label: "21 CFR 117 subpart G (supply-chain program)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-117/subpart-G",
      },
    ],
  },
  {
    code: "fsma_core",
    name: { es: "FSMA (núcleo)", en: "FSMA (core)" },
    owner: "stratum",
    sources: [
      {
        label: "21 CFR 1 subpart H (food facility registration)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-H",
      },
      {
        label: "21 CFR 1 subpart L (FSVP)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-L",
      },
    ],
  },
];

export type RequirementCode =
  | "facility_certification"
  | "questionnaire"
  | "facility_registration"
  | "fsvp_hazard_analysis"
  | "guarantee_letter"
  | "insurance"
  | "specification"
  | "allergen_statement"
  | "food_contact";

/** How bad a gap is. Drives order and the next action; only `blocking` stops an approval. */
export type RequirementSeverity = "critical" | "major" | "minor";

export type RequirementDef = {
  code: RequirementCode;
  program: ProgramCode;
  /** Where the evidence lives: the company, one of its sites, or one source (material). */
  appliesTo: "party" | "site" | "source";
  /** Any one accepted, valid document of these types satisfies it. */
  anyOf: readonly string[];
  severity: RequirementSeverity;
  /**
   * Whether an unmet obligation stops a full approval (a conditional one is still possible).
   * A company can change this in its policy; the default here is deliberately short.
   */
  blocking: boolean;
  /** The catalog version this rule was last changed in. */
  version: string;
  sources: SourceLink[];
};

export const REQUIREMENTS: RequirementDef[] = [
  {
    code: "facility_certification",
    program: "supplier_program",
    appliesTo: "site",
    anyOf: ["gfsi_cert", "audit_report"],
    severity: "major",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [
      {
        label: "21 CFR 117.410 (supplier verification activities)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-117/subpart-G/section-117.410",
      },
    ],
  },
  {
    code: "questionnaire",
    program: "supplier_program",
    appliesTo: "party",
    anyOf: ["questionnaire"],
    severity: "minor",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [],
  },
  {
    // Food facilities must register with FDA (21 CFR 1.225); an unregistered plant can't legally supply.
    code: "facility_registration",
    program: "fsma_core",
    appliesTo: "site",
    anyOf: ["fda_registration"],
    severity: "critical",
    blocking: true,
    version: CATALOG_VERSION,
    sources: [
      {
        label: "21 CFR 1.225 (who must register)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-H/section-1.225",
      },
    ],
  },
  {
    code: "fsvp_hazard_analysis",
    program: "fsma_core",
    appliesTo: "party",
    anyOf: ["hazard_analysis"],
    severity: "critical",
    blocking: true,
    version: CATALOG_VERSION,
    sources: [
      {
        label: "21 CFR 1.504 (FSVP hazard analysis)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-L/section-1.504",
      },
    ],
  },
  {
    code: "guarantee_letter",
    program: "supplier_program",
    appliesTo: "party",
    anyOf: ["guarantee_letter"],
    severity: "major",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [
      {
        label: "21 CFR 7.13 (suggested forms of guaranty)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-7/subpart-A/section-7.13",
      },
    ],
  },
  {
    code: "insurance",
    program: "supplier_program",
    appliesTo: "party",
    anyOf: ["insurance"],
    severity: "minor",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [],
  },
  {
    code: "specification",
    program: "supplier_program",
    appliesTo: "source",
    anyOf: ["spec_sheet"],
    severity: "major",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [],
  },
  {
    code: "allergen_statement",
    program: "supplier_program",
    appliesTo: "source",
    anyOf: ["allergen_statement"],
    severity: "major",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [
      {
        label: "21 CFR 117.135(c)(2) (food allergen controls)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-117/subpart-C/section-117.135",
      },
    ],
  },
  {
    code: "food_contact",
    program: "supplier_program",
    appliesTo: "source",
    anyOf: ["packaging_compliance"],
    severity: "major",
    blocking: false,
    version: CATALOG_VERSION,
    sources: [
      {
        label: "21 CFR 174 (indirect food additives: general)",
        url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-174",
      },
    ],
  },
];

/** A company's changes to the default rules. Only blocking is adjustable for now. */
export type RequirementPolicy = {
  blocking: Partial<Record<RequirementCode, boolean>>;
};

export const DEFAULT_REQUIREMENT_POLICY: RequirementPolicy = { blocking: {} };

export function findRequirement(catalog: RequirementDef[], code: RequirementCode): RequirementDef {
  const def = catalog.find((r) => r.code === code);
  if (!def) throw new Error(`Requirement ${code} is not in the catalog`);
  return def;
}

export function isBlocking(def: RequirementDef, policy: RequirementPolicy = DEFAULT_REQUIREMENT_POLICY): boolean {
  return policy.blocking[def.code] ?? def.blocking;
}

export function findProgram(code: ProgramCode): Program {
  return PROGRAMS.find((p) => p.code === code)!;
}

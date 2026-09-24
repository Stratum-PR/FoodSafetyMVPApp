import type { MaterialKind } from "./suppliers";

/*
 * Default document catalog. Each company starts with this and can edit it later
 * (names, validity, add types). Codes are stable identifiers; names are shown to users.
 */

export type LocalizedText = { es: string; en: string };

/** party: one per supplier (e.g. GFSI certificate). source: one per material + supplier (e.g. spec sheet). */
export type DocumentLevel = "party" | "source";

export type DocumentType = {
  code: string;
  name: LocalizedText;
  level: DocumentLevel;
  /** Months a document stays valid when it has no printed expiration. null = never expires. */
  validityMonths: number | null;
  /** Per-lot documents (COA) are tracked by lot and don't expire. */
  perLot?: boolean;
  /** For source-level types: the material kinds it applies to. */
  materialKinds?: MaterialKind[];
};

export const DEFAULT_VALIDITY_MONTHS = 12;

export const DEFAULT_CATALOG: DocumentType[] = [
  {
    code: "gfsi_cert",
    name: { es: "Certificado GFSI (SQF, BRCGS, FSSC 22000)", en: "GFSI certificate (SQF, BRCGS, FSSC 22000)" },
    level: "party",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
  },
  {
    code: "audit_report",
    name: { es: "Informe de auditoría en sitio", en: "On-site audit report" },
    level: "party",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
  },
  {
    code: "questionnaire",
    name: { es: "Cuestionario de proveedor", en: "Supplier questionnaire" },
    level: "party",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
  },
  {
    // Food facilities renew their FDA registration every two years (Oct–Dec of even years).
    code: "fda_registration",
    name: { es: "Registro de instalación ante la FDA", en: "FDA food facility registration" },
    level: "party",
    validityMonths: 24,
  },
  {
    code: "hazard_analysis",
    name: { es: "Análisis de peligros (FSVP)", en: "Hazard analysis (FSVP)" },
    level: "party",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
  },
  {
    code: "guarantee_letter",
    name: { es: "Carta de garantía continua", en: "Continuing guarantee letter" },
    level: "party",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
  },
  {
    code: "insurance",
    name: { es: "Certificado de seguro", en: "Certificate of insurance" },
    level: "party",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
  },
  {
    code: "spec_sheet",
    name: { es: "Hoja de especificaciones", en: "Specification sheet" },
    level: "source",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
    materialKinds: ["ingredient", "packaging"],
  },
  {
    code: "allergen_statement",
    name: { es: "Declaración de alérgenos", en: "Allergen statement" },
    level: "source",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
    materialKinds: ["ingredient"],
  },
  {
    // Food-contact materials: 21 CFR 174–186.
    code: "packaging_compliance",
    name: { es: "Carta de cumplimiento para contacto con alimentos", en: "Food-contact compliance letter" },
    level: "source",
    validityMonths: DEFAULT_VALIDITY_MONTHS,
    materialKinds: ["packaging"],
  },
  {
    code: "coa",
    name: { es: "Certificado de análisis (COA)", en: "Certificate of analysis (COA)" },
    level: "source",
    validityMonths: null,
    perLot: true,
    materialKinds: ["ingredient", "packaging"],
  },
];

export function findType(catalog: DocumentType[], code: string): DocumentType | undefined {
  return catalog.find((t) => t.code === code);
}

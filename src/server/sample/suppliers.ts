import type { ApprovalRecord } from "@/domain/approval";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { addDays, addMonths, type IsoDate } from "@/domain/dates";
import type { Fsma204Assessment } from "@/domain/fsma204";
import type { Nonconformity, Severity } from "@/domain/nonconformity";
import type { ObligationOverride } from "@/domain/obligations";
import { CATALOG_VERSION } from "@/domain/programs";
import { allRequirements } from "@/domain/requirements";
import { DEFAULT_RISK_POLICY, type RiskAssessment, suggestRating } from "@/domain/risk";
import type { SupplierDataset } from "@/domain/supplier-summary";
import {
  type Approval,
  type ApprovedSource,
  backfillSource,
  CHECKLIST_ITEMS,
  type CoaPolicy,
  type Contact,
  isForeign,
  type LegacySource,
  legacySite,
  type Lifecycle,
  type Material,
  type MaterialKind,
  type Party,
  type PartyType,
  type Risk,
  type Site,
  type SourceQualification,
  type SupplierDocument,
} from "@/domain/suppliers";

/*
 * Fictional supplier data for the sample companies, sized like a real mid-size plant
 * (40+ manufacturers and distributors). Never use real customer or supplier names here:
 * every name is assembled from generic words, and contact emails use the reserved
 * ".example" domain. The same company and date always give the same data, so screens,
 * tests and screenshots are stable; dates are relative to "today" so every status shows up.
 *
 * Sources are generated in the old shape and then backfilled (legacySite, backfillSource),
 * the same path real data takes when sites and qualification are introduced.
 */

export type SampleUser = { id: string; name: string };

/** The signed-in sample user, plus colleagues who upload and review documents. */
export const SAMPLE_USER_ID = "u-sample";
export const SAMPLE_USERS: SampleUser[] = [
  { id: SAMPLE_USER_ID, name: "Usuario de ejemplo" },
  { id: "u-marisol", name: "Marisol Ortiz" },
  { id: "u-rafael", name: "Rafael Cintrón" },
  { id: "u-yaritza", name: "Yaritza Pagán" },
];

/** Everything the supplier screens read, for one sample company. */
export type SampleSupplierData = SupplierDataset;

type Size = { manufacturers: number; distributors: number; ingredients: number; packaging: number };

const SIZES: Record<string, Size> = {
  "alimentos-cordillera": { manufacturers: 32, distributors: 12, ingredients: 48, packaging: 14 },
  "jugos-costa-norte": { manufacturers: 14, distributors: 6, ingredients: 18, packaging: 10 },
  "dulces-la-palma": { manufacturers: 9, distributors: 4, ingredients: 14, packaging: 6 },
};
const DEFAULT_SIZE: Size = { manufacturers: 10, distributors: 4, ingredients: 12, packaging: 6 };

/** Small seeded random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  return { next, int, pick };
}

const minDate = (a: IsoDate, b: IsoDate): IsoDate => (a < b ? a : b);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const MAKER_WORDS = [
  "Molinos",
  "Productos",
  "Industrias",
  "Procesadora",
  "Especias",
  "Lácteos",
  "Aceites",
  "Harinas",
  "Frutas",
  "Conservas",
  "Ingredientes",
  "Cacaos",
];
const PACKAGING_MAKER_WORDS = ["Envases", "Empaques", "Plásticos", "Etiquetas", "Cartonera"];
const DISTRIBUTOR_WORDS = ["Distribuidora", "Almacenes", "Suministros", "Importadora", "Comercial"];
const PLACE_WORDS = [
  "Brisa Azul",
  "Monte Claro",
  "Tres Palmas",
  "Río Sereno",
  "La Ceiba Dorada",
  "Vista Alegre",
  "Loma Verde",
  "Punta Arena",
  "El Yunque Norte",
  "Cerro Alto",
  "Las Garzas",
  "Bahía Serena",
  "Campo Lindo",
  "Valle Grande",
  "Los Almendros",
  "Sol Naciente",
  "La Montañita",
  "Cañaveral",
  "El Batey",
  "Mar y Sierra",
  "Nueve Robles",
  "La Estancia",
  "Buena Cosecha",
  "Tierra Fértil",
  "Arrecife",
  "Los Tamarindos",
  "Colina Azul",
  "Siete Mares",
];

const LOCAL_CITIES = [
  "Caguas",
  "Bayamón",
  "Carolina",
  "Mayagüez",
  "Guaynabo",
  "Toa Baja",
  "Humacao",
  "Cidra",
  "Vega Baja",
  "Juncos",
];
const US_CITIES = ["Miami, FL", "Orlando, FL", "Atlanta, GA", "Houston, TX", "Newark, NJ", "Charlotte, NC"];
const FOREIGN: { country: string; cities: string[]; suffix: string }[] = [
  { country: "MX", cities: ["Guadalajara", "Monterrey", "Puebla"], suffix: "S.A. de C.V." },
  { country: "DO", cities: ["Santiago", "Santo Domingo", "La Vega"], suffix: "S.R.L." },
  { country: "CO", cities: ["Medellín", "Cali", "Bogotá"], suffix: "S.A.S." },
  { country: "CR", cities: ["Alajuela", "Heredia", "Cartago"], suffix: "S.A." },
  { country: "ES", cities: ["Valencia", "Murcia", "Sevilla"], suffix: "S.L." },
];

const INGREDIENTS = [
  "Azúcar refinada",
  "Azúcar morena",
  "Harina de trigo",
  "Harina de maíz",
  "Sal refinada",
  "Aceite de soya",
  "Aceite de canola",
  "Leche en polvo",
  "Queso fresco",
  "Mantequilla",
  "Huevo líquido pasteurizado",
  "Cacao en polvo",
  "Chocolate semiamargo",
  "Extracto de vainilla",
  "Canela molida",
  "Nuez moscada",
  "Pulpa de guayaba",
  "Pulpa de parcha",
  "Pulpa de mango",
  "Concentrado de china",
  "Concentrado de piña",
  "Coco rallado",
  "Crema de coco",
  "Maní tostado",
  "Almendra fileteada",
  "Ajonjolí",
  "Pasas",
  "Almidón de maíz",
  "Almidón modificado",
  "Ácido cítrico",
  "Benzoato de sodio",
  "Sorbato de potasio",
  "Goma xantana",
  "Pectina",
  "Levadura seca",
  "Polvo de hornear",
  "Bicarbonato de sodio",
  "Glucosa líquida",
  "Jarabe de maíz",
  "Miel",
  "Sabor natural de fresa",
  "Color caramelo",
  "Lecitina de soya",
  "Avena en hojuelas",
  "Arroz",
  "Habichuelas rosadas",
  "Cilantro fresco",
  "Cebolla deshidratada",
  "Pimienta negra",
  "Orégano",
  "Sofrito base",
  "Queso cheddar",
];
const PACKAGING = [
  "Botella PET 500 ml",
  "Botella PET 1 L",
  "Tapa 28 mm",
  "Frasco de vidrio 12 oz",
  "Tapa metálica 63 mm",
  "Etiqueta autoadhesiva",
  "Caja corrugada 12 unidades",
  "Film estirable",
  "Bolsa laminada 1 lb",
  "Bandeja de cartón",
  "Envoltura para dulces",
  "Lata 8 oz",
  "Sello de inducción",
  "Envase de polipropileno 16 oz",
  "Tapa a presión",
  "Cartón plegadizo",
];

/** Foods checked against FDA's Food Traceability List. Everything else stays "not checked". */
const FTL: Record<string, boolean> = {
  "Queso fresco": true, // soft cheese: on the list
  "Cilantro fresco": true, // fresh herbs: on the list
  "Azúcar refinada": false,
  "Sal refinada": false,
  "Harina de trigo": false,
};

const FIRST_NAMES = ["Ana", "Luis", "Carmen", "José", "Lourdes", "Héctor", "Wanda", "Edwin", "Nilda", "Ramón"];
const LAST_NAMES = ["Rivera", "Torres", "Santiago", "Colón", "Vázquez", "Ortiz", "Figueroa", "Rosario", "Nieves"];
const SPANISH_COUNTRIES = new Set(["PR", "MX", "DO", "CO", "CR", "ES"]);

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);

export function generateSampleSuppliers(companySlug: string, today: IsoDate): SampleSupplierData {
  const r = rng(hash(companySlug));
  const size = SIZES[companySlug] ?? DEFAULT_SIZE;
  const usedNames = new Set<string>();

  function uniqueName(first: readonly string[], suffix = ""): string {
    for (;;) {
      const name = `${r.pick(first)} ${r.pick(PLACE_WORDS)}${suffix ? ` ${suffix}` : ""}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
  }

  function location(allowForeign: boolean): { city: string; country: string; suffix: string } {
    const roll = r.next();
    if (allowForeign && roll < 0.2) {
      const f = r.pick(FOREIGN);
      return { city: r.pick(f.cities), country: f.country, suffix: f.suffix };
    }
    if (roll < 0.45) return { city: r.pick(US_CITIES), country: "US", suffix: "Inc." };
    return { city: r.pick(LOCAL_CITIES), country: "PR", suffix: "Inc." };
  }

  // Mostly approved and monitored; a few in every other state so every screen has examples.
  const STATES: [Lifecycle, Approval][] = [
    ["onboarding", "pending"],
    ["verification", "pending"],
    ["monitoring", "conditional"],
    ["suspended", "suspended"],
    ["inactive", "approved"],
  ];
  // Spread the special states across the list: positions size/6, 2·size/6, …
  function state(index: number, count: number): [Lifecycle, Approval] {
    const k = STATES.findIndex((_, n) => Math.floor((count * (n + 1)) / 6) === index);
    return k === -1 ? ["monitoring", "approved"] : STATES[k];
  }

  const parties: Party[] = [];
  const creators = SAMPLE_USERS.map((u) => u.id);
  const packagingMakers = Math.max(2, Math.round(size.manufacturers * 0.2));

  for (let i = 0; i < size.manufacturers; i++) {
    const isPackaging = i >= size.manufacturers - packagingMakers;
    const loc = location(!isPackaging);
    const [lifecycle, approval] = state(i, size.manufacturers);
    parties.push({
      id: `p-m${i + 1}`,
      name: uniqueName(isPackaging ? PACKAGING_MAKER_WORDS : MAKER_WORDS, loc.suffix),
      // A few manufacturers also sell other makers' products.
      type: i % 11 === 3 ? "both" : "manufacturer",
      direction: "request",
      city: loc.city,
      country: loc.country,
      fei: r.next() < 0.7 ? String(3000000000 + r.int(0, 99999999)) : undefined,
      lifecycle,
      approval,
      createdBy: r.pick(creators),
    });
  }
  for (let i = 0; i < size.distributors; i++) {
    const loc =
      r.next() < 0.75 ? { city: r.pick(LOCAL_CITIES), country: "PR" } : { city: r.pick(US_CITIES), country: "US" };
    const [lifecycle, approval]: [Lifecycle, Approval] = i === 1 ? STATES[0] : ["monitoring", "approved"];
    parties.push({
      id: `p-d${i + 1}`,
      name: uniqueName(DISTRIBUTOR_WORDS, "Inc."),
      type: "distributor" satisfies PartyType,
      direction: "request",
      ...loc,
      lifecycle,
      approval,
      createdBy: r.pick(creators),
    });
  }

  // Sites: every party keeps its old location as its legacy site (backfill); a few food
  // manufacturers also have a second, named plant, so certificates differ by facility.
  const sites: Site[] = parties.map((p) => legacySite(p));
  parties.forEach((p, i) => {
    if (p.type === "distributor" || i % 5 !== 1) return;
    sites.push({
      id: `${p.id}-site-2`,
      partyId: p.id,
      name: `Planta ${p.city.split(",")[0]} 2`,
      kind: "plant",
      address: `Carr. ${100 + i * 7} km ${(i % 9) + 1}.${i % 10}`,
      city: p.city,
      country: p.country,
      fei: String(3100000000 + i * 7919),
      gln: gln(`0${String(7401234000 + i * 37).padStart(11, "0")}`),
      legacy: false,
    });
  });
  const sitesOf = (partyId: string) => sites.filter((s) => s.partyId === partyId);

  const contacts: Contact[] = parties.flatMap((p, i) => {
    const language = SPANISH_COUNTRIES.has(p.country) ? "es" : "en";
    const domain = `${slug(p.name)}.example`;
    const person = (k: number) => {
      const first = FIRST_NAMES[(i + k * 3) % FIRST_NAMES.length];
      const last = LAST_NAMES[(i * 2 + k) % LAST_NAMES.length];
      return { name: `${first} ${last}`, email: `${slug(first)}.${slug(last)}@${domain}` };
    };
    const list: Contact[] = [
      {
        id: `${p.id}-c1`,
        partyId: p.id,
        ...person(0),
        phone: `787-555-${String(1000 + i * 17).slice(-4)}`,
        language,
        role: p.type === "distributor" ? "regulatory" : "food_safety",
        isPrimary: true,
      },
    ];
    if (i % 3 === 0) {
      list.push({ id: `${p.id}-c2`, partyId: p.id, ...person(1), language, role: "sales", isPrimary: false });
    }
    return list;
  });

  const makers = parties.filter((p) => p.type !== "distributor");
  const foodMakers = makers.slice(0, size.manufacturers - packagingMakers);
  const packMakers = makers.slice(size.manufacturers - packagingMakers);
  const sellers = parties.filter((p) => p.type !== "manufacturer");

  const materials: Material[] = [];
  const addMaterials = (names: string[], kind: MaterialKind, count: number, prefix: string) => {
    for (let i = 0; i < Math.min(count, names.length); i++) {
      materials.push({
        id: `mat-${prefix}${i + 1}`,
        name: names[i],
        code: `${prefix.toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
        kind,
        ...(names[i] in FTL ? { onFtl: FTL[names[i]] } : {}),
      });
    }
  };
  addMaterials(INGREDIENTS, "ingredient", size.ingredients, "ing");
  addMaterials(PACKAGING, "packaging", size.packaging, "pkg");

  // Sources as the old model stored them, then backfilled to sites and split statuses.
  const legacy: LegacySource[] = [];
  const RISKS: Risk[] = ["low", "medium", "medium", "high"];
  materials.forEach((material, i) => {
    const count = i % 4 === 0 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const pool = material.kind === "packaging" ? packMakers : foodMakers;
      const manufacturer = pool[(i * 3 + k * 5) % pool.length];
      const direct = r.next() < 0.35;
      const distributor = direct ? null : sellers[(i + k) % sellers.length];
      const blocked = manufacturer.lifecycle === "inactive" || manufacturer.lifecycle === "suspended";
      legacy.push({
        id: `src-${legacy.length + 1}`,
        materialId: material.id,
        manufacturerId: manufacturer.id,
        distributorId: distributor && distributor.id !== manufacturer.id ? distributor.id : null,
        // The second source of a material is often a backup that isn't bought today.
        status: blocked ? "inactive" : k === 1 && r.next() < 0.4 ? "inactive" : i === 5 ? "rejected" : "active",
        risk: r.pick(RISKS),
      });
    }
  });
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const sources: ApprovedSource[] = legacy.map((l, n) => {
    const own = sitesOf(l.manufacturerId);
    const source = backfillSource(l, own[n % own.length].id);
    return qualifySample(source, partyById.get(l.manufacturerId)!, materialById.get(l.materialId)!, n, today);
  });

  // One document per requirement, in a spread of states. Onboarding parties are mostly empty.
  const documents: SupplierDocument[] = [];
  const onboarding = new Set(parties.filter((p) => p.lifecycle === "onboarding").map((p) => p.id));
  const partyOfSource = new Map(sources.map((s) => [s.id, s.manufacturerId]));
  const partyOfSite = new Map(sites.map((s) => [s.id, s.partyId]));
  const uploaders = SAMPLE_USERS.map((u) => u.id);

  for (const requirement of allRequirements({ parties, sites, materials, sources })) {
    const subject = requirement.subject;
    const partyId =
      subject.kind === "party"
        ? subject.partyId
        : subject.kind === "site"
          ? partyOfSite.get(subject.siteId)
          : partyOfSource.get(subject.sourceId);
    const roll = r.next();
    const early = partyId !== undefined && onboarding.has(partyId);
    if (early ? roll < 0.7 : roll < 0.06) continue; // missing

    const typeCode = r.pick(requirement.anyOf);
    // current 72%, expiring 9%, expired 7%, pending review 6% (of the non-missing).
    const kind = roll < 0.78 ? "current" : roll < 0.87 ? "expiring" : roll < 0.94 ? "expired" : "pending";
    const printed = r.next() < 0.5;
    const validity = typeCode === "fda_registration" ? 24 : 12;
    let issuedOn: IsoDate;
    if (kind === "expiring") issuedOn = addMonths(addDays(today, r.int(1, 28)), -validity);
    else if (kind === "expired") issuedOn = addMonths(addDays(today, -r.int(1, 90)), -validity);
    else issuedOn = addDays(today, -r.int(10, 300));

    documents.push({
      id: `doc-${documents.length + 1}`,
      typeCode,
      subject,
      state: kind === "pending" ? "pending_review" : "accepted",
      issuedOn,
      // Received a few days after issue, but never after today.
      receivedOn: minDate(addDays(issuedOn, r.int(0, 20)), today),
      expiresOn: printed ? addMonths(issuedOn, validity) : undefined,
      uploadedBy: r.pick(uploaders),
    });
  }

  // A few per-lot COAs on active ingredient sources.
  for (const source of sources.filter((s) => s.commercial === "active").slice(0, 8)) {
    documents.push({
      id: `doc-${documents.length + 1}`,
      typeCode: "coa",
      subject: { kind: "source", sourceId: source.id },
      state: "accepted",
      receivedOn: addDays(today, -r.int(1, 45)),
      lotCode: `L${r.int(10000, 99999)}`,
      uploadedBy: r.pick(uploaders),
    });
  }

  // Accepted documents were reviewed by a colleague other than the uploader (separation of
  // duties), a few days after arriving. Derived without the random generator so the rest of
  // the data stays the same.
  documents.forEach((d, i) => {
    if (d.state !== "accepted") return;
    const uploader = uploaders.indexOf(d.uploadedBy);
    d.reviewedBy = uploaders[(uploader + 1 + (i % (uploaders.length - 1))) % uploaders.length];
    const reviewed = addDays(d.receivedOn, 1 + (i % 6));
    d.reviewedOn = minDate(reviewed, today);
  });

  // Three of every four accepted GFSI certificates have their details recorded and checked in
  // the scheme owner's directory; the rest were accepted as a PDF only (not yet verified).
  const SCHEMES = ["sqf", "brcgs", "fssc22000", "primusgfs"];
  documents
    .filter((d) => d.typeCode === "gfsi_cert" && d.state === "accepted")
    .forEach((d, i) => {
      if (i % 4 === 3) return;
      const subject = d.subject;
      const site = subject.kind === "site" ? sites.find((s) => s.id === subject.siteId) : undefined;
      const owner = site ? partyById.get(site.partyId) : undefined;
      d.verification = {
        checklist: CHECKLIST_ITEMS,
        details: {
          kind: "certificate",
          scheme: SCHEMES[i % SCHEMES.length],
          scope: i % 2 ? "Fabricación y empaque de ingredientes secos" : "Procesamiento y almacenaje de alimentos",
          issuingBody: `Certificadora Ejemplo ${String.fromCharCode(65 + (i % 4))}`,
          certificateNumber: `CERT-${String(10000 + i * 131)}`,
          facility: `${owner?.name ?? ""}, ${site?.name ?? site?.city ?? ""}`,
          auditDate: d.issuedOn ? addDays(d.issuedOn, -20) : undefined,
          directoryVerified: true,
        },
      };
    });

  // History: about a third of the accepted documents replaced one or two earlier versions
  // (last year's certificate, and the one before). Kept as "superseded", so they never count
  // toward compliance but show up in the document's history.
  const current = documents.filter((d) => d.state === "accepted" && d.typeCode !== "coa" && d.issuedOn);
  current.forEach((d, i) => {
    if (i % 3 !== 0) return;
    const validity = findType(DEFAULT_CATALOG, d.typeCode)?.validityMonths ?? 12;
    const versions = i % 9 === 0 ? 2 : 1;
    for (let v = 1; v <= versions; v++) {
      const issuedOn = addMonths(d.issuedOn!, -validity * v);
      const receivedOn = addDays(issuedOn, 1 + ((i + v) % 10));
      const uploader = (i + v) % uploaders.length;
      documents.push({
        id: `doc-${documents.length + 1}`,
        typeCode: d.typeCode,
        subject: d.subject,
        state: "superseded",
        issuedOn,
        receivedOn,
        expiresOn: d.expiresOn ? addMonths(issuedOn, validity) : undefined,
        uploadedBy: uploaders[uploader],
        reviewedBy: uploaders[(uploader + 1) % uploaders.length],
        reviewedOn: addDays(receivedOn, 2),
      });
    }
  });

  const { approvals, nonconformities } = sampleApprovalHistory(parties, sources, today, uploaders);
  const riskAssessments = sampleRiskAssessments(parties, today, uploaders);
  const fsma204 = sampleFsma204(parties, sources, materials, today, uploaders);
  const overrides = sampleOverrides(parties, sites, today, uploaders);
  return {
    parties,
    sites,
    contacts,
    materials,
    sources,
    documents,
    approvals,
    nonconformities,
    riskAssessments,
    fsma204,
    overrides,
  };
}

/** GS1 check digit (mod 10, weights 3 and 1 from the right) appended to 12 digits. */
function gln(twelve: string): string {
  const digits = twelve.slice(-12).split("").map(Number);
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return `${twelve.slice(-12)}${(10 - (sum % 10)) % 10}`;
}

/**
 * The food-safety decision on each source, from its manufacturer's state. Derived without the
 * random generator. Approved suppliers have most of their active sources qualified, the rest
 * never assessed (as after a real import); the conditional and suspended ones carry their
 * status down; nothing is ever assumed approved.
 */
function qualifySample(
  source: ApprovedSource,
  maker: Party,
  material: Material,
  n: number,
  today: IsoDate,
): ApprovedSource {
  if (source.qualification.status === "rejected") {
    return {
      ...source,
      qualification: {
        status: "rejected",
        decidedBy: "u-marisol",
        decidedOn: addMonths(today, -8),
        rationale: "La especificación no cumple el límite de humedad acordado.",
      },
    };
  }
  const decidedOn = addMonths(today, -(3 + (n % 9)));
  const decided = (status: SourceQualification["status"], extra: Partial<SourceQualification> = {}) => ({
    ...source,
    specification: `ESP-${material.code}-r${1 + (n % 3)}`,
    coaPolicy: (material.kind === "packaging"
      ? "periodic"
      : source.risk === "high"
        ? "every_lot"
        : "periodic") as CoaPolicy,
    qualification: {
      status,
      decidedBy: ["u-marisol", "u-rafael", "u-yaritza"][n % 3],
      decidedOn,
      rationale: "Especificación, certificado del sitio y desempeño revisados.",
      ...extra,
    },
  });
  if (maker.approval === "conditional") {
    return decided("conditional", {
      reviewBy: addMonths(today, 2),
      restrictions: "Retener cada lote hasta revisar su certificado de análisis.",
      rationale: "Certificado del sitio en renovación.",
    });
  }
  if (maker.approval === "suspended") return decided("suspended", { rationale: "Suspendido junto con el suplidor." });
  if (maker.approval === "pending") {
    return maker.lifecycle === "verification" ? { ...source, qualification: { status: "pending" } } : source;
  }
  return n % 3 === 2 ? source : decided("approved");
}

const NONCONFORMITY_TEXTS: { severity: Severity; description: string; lot?: boolean }[] = [
  { severity: "major", description: "Lote recibido sin certificado de análisis.", lot: true },
  { severity: "minor", description: "Etiqueta del empaque sin número de lote legible.", lot: true },
  { severity: "major", description: "Temperatura del camión fuera de rango al recibir (9 °C).", lot: true },
  { severity: "critical", description: "Material extraño (plástico) encontrado en el producto.", lot: true },
  { severity: "minor", description: "Entrega dos días tarde sin aviso previo." },
];

/** Nonconformities older than this are closed in the sample; newer ones are still open. */
const CLOSED_AFTER_DAYS = 100;

/**
 * Approval history and nonconformities for the sample, derived from the suppliers' states
 * (no random calls, so the rest of the data stays the same): every approved supplier has its
 * approval on record with its basis and review date; the conditional one is past its review
 * date; the suspended one has the nonconformities that led to it; one approved supplier has
 * just reached three; and one approved supplier is overdue for its periodic review.
 */
function sampleApprovalHistory(
  parties: Party[],
  sources: ApprovedSource[],
  today: IsoDate,
  users: string[],
): { approvals: ApprovalRecord[]; nonconformities: Nonconformity[] } {
  const approvals: ApprovalRecord[] = [];
  const nonconformities: Nonconformity[] = [];
  const reviewer = (i: number) => users[(i + 1) % users.length];

  const addNonconformities = (party: Party, i: number, dates: IsoDate[]) =>
    dates.forEach((date, k) => {
      const text = NONCONFORMITY_TEXTS[(i + k) % NONCONFORMITY_TEXTS.length];
      const closed = date < addDays(today, -CLOSED_AFTER_DAYS);
      nonconformities.push({
        id: `nc-${nonconformities.length + 1}`,
        partyId: party.id,
        date,
        severity: text.severity,
        description: text.description,
        lotCode: text.lot ? `L${String(40000 + i * 97 + k * 13)}` : undefined,
        recordedBy: users[(i + k) % users.length],
        recordedOn: date,
        status: closed ? "closed" : "open",
        ...(closed
          ? {
              closedBy: users[(i + k + 1) % users.length],
              closedOn: addDays(date, 21),
              closeNote: "El suplidor envió su acción correctiva; se verificó en la siguiente entrega.",
            }
          : {}),
      });
    });

  let warned = false;
  let noted = false;
  let overdue = false;
  parties.forEach((party, i) => {
    if (party.approval === "pending") return;
    const approvedOn = addMonths(today, -(6 + (i % 18)));
    let reviewBy = addMonths(approvedOn, 24);
    if (!overdue && party.approval === "approved" && party.lifecycle === "monitoring" && i > 3) {
      overdue = true;
      reviewBy = addDays(today, -10);
    }
    approvals.push({
      id: `ap-${approvals.length + 1}`,
      partyId: party.id,
      on: approvedOn,
      actorId: reviewer(i),
      action: "approve",
      from: { approval: "pending", lifecycle: "verification" },
      to: { approval: "approved", lifecycle: "monitoring" },
      basis: i % 2 ? ["certification", "questionnaire"] : ["audit", "specification", "questionnaire"],
      terms: { reviewBy },
    });
    party.terms = { reviewBy };

    if (party.approval === "conditional") {
      const terms = {
        reviewBy: addDays(today, -3),
        conditions: "Enviar el certificado GFSI vigente y la carta de garantía firmada.",
        owner: users[(i + 2) % users.length],
        effectiveOn: addDays(today, -45),
        allowedSourceIds: sources
          .filter((s) => s.manufacturerId === party.id && s.commercial === "active")
          .slice(0, 1)
          .map((s) => s.id),
        restrictions: ["coa_every_lot" as const],
      };
      party.terms = terms;
      approvals.push({
        id: `ap-${approvals.length + 1}`,
        partyId: party.id,
        on: addDays(today, -45),
        actorId: reviewer(i + 1),
        action: "approve_conditional",
        from: { approval: "approved", lifecycle: "monitoring" },
        to: { approval: "conditional", lifecycle: "monitoring" },
        reason: "El certificado GFSI venció y la renovación está en proceso.",
        basis: ["questionnaire", "history"],
        terms,
      });
    }

    if (party.approval === "suspended") {
      party.terms = undefined;
      addNonconformities(party, i, [addDays(today, -150), addDays(today, -90), addDays(today, -35)]);
      approvals.push({
        id: `ap-${approvals.length + 1}`,
        partyId: party.id,
        on: addDays(today, -30),
        actorId: reviewer(i + 1),
        action: "suspend",
        from: { approval: "approved", lifecycle: "monitoring" },
        to: { approval: "suspended", lifecycle: "suspended" },
        reason: "Tres no conformidades en cinco meses; se suspende hasta recibir su plan de acción.",
      });
    }

    // One approved supplier has just reached three nonconformities (the warning); another has one.
    if (party.approval === "approved" && party.lifecycle === "monitoring" && party.type !== "distributor") {
      if (!warned) {
        warned = true;
        addNonconformities(party, i, [addDays(today, -200), addDays(today, -60), addDays(today, -6)]);
      } else if (!noted) {
        noted = true;
        addNonconformities(party, i, [addDays(today, -120)]);
      }
    }
  });
  return { approvals, nonconformities };
}

/**
 * Risk assessments: two of every three approved suppliers were assessed (a few twice, after a
 * policy change); the rest, and every supplier still being onboarded, stay "not assessed".
 */
function sampleRiskAssessments(parties: Party[], today: IsoDate, users: string[]): RiskAssessment[] {
  const list: RiskAssessment[] = [];
  const LEVELS: Risk[] = ["low", "medium", "low", "high", "medium"];
  parties.forEach((p, i) => {
    if (p.approval === "pending" || i % 3 === 2) return;
    const factors = {
      material_hazard: LEVELS[i % 5],
      origin: isForeign(p) ? ("medium" as const) : ("low" as const),
      certification: LEVELS[(i + 2) % 5],
      history: p.approval === "suspended" ? ("high" as const) : ("low" as const),
      allergens: i % 2 ? ("medium" as const) : ("low" as const),
    };
    const rating = suggestRating(factors, DEFAULT_RISK_POLICY);
    const versions = i % 7 === 0 ? 2 : 1;
    for (let v = 1; v <= versions; v++) {
      const assessedOn = addMonths(today, -(versions - v) * 12 - (1 + (i % 10)));
      list.push({
        id: `risk-${list.length + 1}`,
        partyId: p.id,
        version: v,
        factors,
        suggested: rating,
        rating,
        rationale:
          rating === "high"
            ? "Material de alto riesgo sin certificación verificada del sitio."
            : "Historial estable, certificación y especificaciones al día.",
        policyVersion: v < versions ? "2025-06-01" : DEFAULT_RISK_POLICY.version,
        assessedBy: users[(i + v) % users.length],
        assessedOn,
        nextReviewOn: addMonths(assessedOn, rating === "high" ? 6 : 12),
      });
    }
  });
  return list;
}

/**
 * FSMA 204 applicability: decided for the suppliers of foods whose list status was checked;
 * everyone else stays "not assessed". Never inferred.
 */
function sampleFsma204(
  parties: Party[],
  sources: ApprovedSource[],
  materials: Material[],
  today: IsoDate,
  users: string[],
): Fsma204Assessment[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const list: Fsma204Assessment[] = [];
  parties.forEach((p, i) => {
    const mine = sources.filter((s) => s.manufacturerId === p.id && s.commercial === "active");
    const flags = mine.map((s) => byId.get(s.materialId)?.onFtl);
    const base = { id: `fsma-${list.length + 1}`, partyId: p.id, version: 1, assessedBy: users[i % users.length] };
    if (flags.includes(true)) {
      list.push({
        ...base,
        decision: "applicable",
        rationale: "Suple un alimento de la Lista de Trazabilidad (queso fresco o hierbas frescas).",
        assessedOn: addDays(today, -40),
      });
    } else if (flags.length && flags.every((f) => f === false)) {
      list.push({
        ...base,
        decision: "not_applicable",
        rationale: "Lo que se le compra (azúcar, sal, harina) no está en la Lista de Trazabilidad de Alimentos.",
        assessedOn: addDays(today, -60),
      });
    }
  });
  return list;
}

/** One waiver and one not-applicable decision, so both show up with their reasons. */
function sampleOverrides(parties: Party[], sites: Site[], today: IsoDate, users: string[]): ObligationOverride[] {
  const distributors = parties.filter((p) => p.type === "distributor" && p.approval === "approved");
  const list: ObligationOverride[] = [];
  if (distributors[0]) {
    list.push({
      id: "ov-1",
      key: `party:${distributors[0].id}|insurance`,
      kind: "waived",
      reason: "Póliza en renovación; el corredor confirmó la cubierta por escrito.",
      by: users[1],
      on: addDays(today, -10),
      until: addDays(today, 50),
      ruleVersion: CATALOG_VERSION,
    });
  }
  const second = distributors[2];
  const site = second ? sites.find((s) => s.partyId === second.id) : undefined;
  if (site) {
    list.push({
      id: "ov-2",
      key: `site:${site.id}|facility_certification`,
      kind: "not_applicable",
      reason: "Solo reempaca material ya sellado; el programa acepta la auditoría del manufacturero.",
      by: users[2],
      on: addDays(today, -90),
      ruleVersion: CATALOG_VERSION,
    });
  }
  return list;
}

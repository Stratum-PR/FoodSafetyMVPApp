import { addDays, addMonths, type IsoDate } from "@/domain/dates";
import { allRequirements, type SupplierData } from "@/domain/requirements";
import type {
  ApprovedSource,
  Approval,
  Lifecycle,
  Material,
  MaterialKind,
  Party,
  PartyType,
  Risk,
  SupplierDocument,
} from "@/domain/suppliers";

/*
 * Fictional supplier data for the sample companies, sized like a real mid-size plant
 * (40+ manufacturers and distributors). Never use real customer or supplier names here:
 * every name is assembled from generic words. The same company and date always give the
 * same data, so screens, tests and screenshots are stable; dates are relative to "today"
 * so every document status always shows up.
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

export type SampleSupplierData = SupplierData & { documents: SupplierDocument[] };

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
  "Suero de leche",
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
  "Ajo deshidratado",
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
      ...loc,
      lifecycle,
      approval,
      createdBy: r.pick(creators),
    });
  }

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
      });
    }
  };
  addMaterials(INGREDIENTS, "ingredient", size.ingredients, "ing");
  addMaterials(PACKAGING, "packaging", size.packaging, "pkg");

  const sources: ApprovedSource[] = [];
  const RISKS: Risk[] = ["low", "medium", "medium", "high"];
  materials.forEach((material, i) => {
    const count = i % 4 === 0 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const pool = material.kind === "packaging" ? packMakers : foodMakers;
      const manufacturer = pool[(i * 3 + k * 5) % pool.length];
      const direct = r.next() < 0.35;
      const distributor = direct ? null : sellers[(i + k) % sellers.length];
      const blocked = manufacturer.lifecycle === "inactive" || manufacturer.lifecycle === "suspended";
      sources.push({
        id: `src-${sources.length + 1}`,
        materialId: material.id,
        manufacturerId: manufacturer.id,
        distributorId: distributor && distributor.id !== manufacturer.id ? distributor.id : null,
        // The second source of a material is often a backup that isn't bought today.
        status: blocked ? "inactive" : k === 1 && r.next() < 0.4 ? "inactive" : i === 5 ? "rejected" : "active",
        risk: r.pick(RISKS),
      });
    }
  });

  // One document per requirement, in a spread of states. Onboarding parties are mostly empty.
  const documents: SupplierDocument[] = [];
  const onboarding = new Set(parties.filter((p) => p.lifecycle === "onboarding").map((p) => p.id));
  const partyOfSource = new Map(sources.map((s) => [s.id, s.manufacturerId]));
  const uploaders = SAMPLE_USERS.map((u) => u.id);

  for (const requirement of allRequirements({ parties, materials, sources })) {
    const partyId =
      requirement.subject.kind === "party"
        ? requirement.subject.partyId
        : partyOfSource.get(requirement.subject.sourceId);
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
      subject: requirement.subject,
      state: kind === "pending" ? "pending_review" : "accepted",
      issuedOn,
      receivedOn: addDays(issuedOn, r.int(0, 20)),
      expiresOn: printed ? addMonths(issuedOn, validity) : undefined,
      uploadedBy: r.pick(uploaders),
    });
  }

  // A few per-lot COAs on active ingredient sources.
  for (const source of sources.filter((s) => s.status === "active").slice(0, 8)) {
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

  return { parties, materials, sources, documents };
}

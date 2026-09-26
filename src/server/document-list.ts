import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { daysBetween, type IsoDate } from "@/domain/dates";
import {
  isHighRisk,
  PRIORITY_RANK,
  type ReviewPriority,
  requirementsCoveredBy,
  reviewPriority,
} from "@/domain/evidence";
import type { Obligation } from "@/domain/obligations";
import type { ProgramCode, RequirementCode } from "@/domain/programs";
import type { DocumentRequest } from "@/domain/requests";
import { expirationOf } from "@/domain/status";
import type { DocumentState, DocumentSubject, SupplierDocument } from "@/domain/suppliers";
import { documentVersions } from "@/domain/versions";

import type { SampleSupplierData, SampleUser } from "./sample/suppliers";

/*
 * The company-wide document list, its filters and the evidence-gaps view. Pure functions,
 * tested against the sample data; the service adds permissions around them. The URL holds
 * every filter (Spanish names), so a filtered view can be shared and reloaded.
 */

export type DocumentRow = {
  id: string;
  typeCode: string;
  state: DocumentState;
  subjectKind: DocumentSubject["kind"];
  /** The supplier: the party itself, the site's owner, or the manufacturer of a material. */
  partyId: string;
  partyName: string;
  /** The facility, for site- and material-level documents. */
  site: string | null;
  /** Material name for material-level documents. */
  materialName: string | null;
  lotCode?: string;
  issuedOn?: IsoDate;
  receivedOn: IsoDate;
  expires: IsoDate | null;
  uploadedBy: string;
  uploadedByName: string;
  reviewedByName?: string;
  receivedVia: "team" | "portal";
  /** The request it answers, when it came through a request link. */
  requestId?: string;
  fileName?: string;
  /** 1 = the first version of this record received. */
  version: number;
  /** Requirements it covers (or would cover once accepted). */
  requirements: { code: RequirementCode; program: ProgramCode; blocking: boolean }[];
  /** How many materials rely on those requirements (the obligations it serves). */
  obligationCount: number;
  highRisk: boolean;
  /** It would fill a missing or expired requirement. */
  blocking: boolean;
  priority: ReviewPriority;
};

export type ListContext = {
  data: SampleSupplierData;
  obligations: Obligation[];
  requests: DocumentRequest[];
  users: SampleUser[];
  today: IsoDate;
};

function place(data: SampleSupplierData, subject: DocumentSubject) {
  const siteLabel = (siteId: string) => {
    const s = data.sites.find((x) => x.id === siteId);
    return s ? [s.name, s.city].filter(Boolean).join(", ") : null;
  };
  if (subject.kind === "party") return { partyId: subject.partyId, site: null, materialName: null };
  if (subject.kind === "site") {
    return {
      partyId: data.sites.find((s) => s.id === subject.siteId)?.partyId ?? "",
      site: siteLabel(subject.siteId),
      materialName: null,
    };
  }
  const source = data.sources.find((s) => s.id === subject.sourceId);
  return {
    partyId: source?.manufacturerId ?? "",
    site: source ? siteLabel(source.siteId) : null,
    materialName: data.materials.find((m) => m.id === source?.materialId)?.name ?? null,
  };
}

export function toDocumentRows(ctx: ListContext): DocumentRow[] {
  const { data, obligations, requests, users } = ctx;
  const parties = new Map(data.parties.map((p) => [p.id, p.name]));
  const contactName = new Map(data.contacts.map((c) => [`portal:${c.id}`, c.name]));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? contactName.get(id) ?? id;
  const requirements = obligations.map((o) => o.requirement);
  const docStatus = new Map(obligations.map((o) => [o.requirement.key, o.documentStatus]));
  const requestOfItem = new Map(requests.flatMap((r) => r.items.map((i) => [i.id, r.id] as const)));

  return data.documents.map((d: SupplierDocument) => {
    const where = place(data, d.subject);
    const covered = requirementsCoveredBy(d, requirements);
    const blocking = covered.some((r) => ["missing", "expired"].includes(docStatus.get(r.key) ?? ""));
    const highRisk = isHighRisk(d, data.sources, data.sites);
    const versions = documentVersions(d, data.documents);
    return {
      id: d.id,
      typeCode: d.typeCode,
      state: d.state,
      subjectKind: d.subject.kind,
      ...where,
      partyName: parties.get(where.partyId) ?? "",
      lotCode: d.lotCode,
      issuedOn: d.issuedOn,
      receivedOn: d.receivedOn,
      expires: expirationOf(d, findType(DEFAULT_CATALOG, d.typeCode)),
      uploadedBy: d.uploadedBy,
      uploadedByName: userName(d.uploadedBy),
      reviewedByName: d.reviewedBy ? userName(d.reviewedBy) : undefined,
      receivedVia: d.receivedVia ?? "team",
      requestId: d.requestItemId ? requestOfItem.get(d.requestItemId) : undefined,
      fileName: d.file?.name,
      version: versions.length - versions.findIndex((v) => v.id === d.id),
      requirements: covered.map((r) => ({ code: r.code, program: r.program, blocking: r.blocking })),
      obligationCount: covered.reduce((n, r) => n + r.sourceIds.length, 0),
      highRisk,
      blocking,
      priority: reviewPriority(blocking, highRisk),
    };
  });
}

/* Filters. Tabs are review states; replaced versions are a lifecycle filter of Accepted. */

export const DOCUMENT_TABS = ["revisar", "aceptados", "rechazados"] as const;
export type DocumentTab = (typeof DOCUMENT_TABS)[number];
const TAB_STATE: Record<DocumentTab, DocumentState> = {
  revisar: "pending_review",
  aceptados: "accepted",
  rechazados: "rejected",
};

/** actuales: the version in force. reemplazados: older accepted versions. todas: both. */
export const LIFECYCLES = ["actuales", "reemplazados", "todas"] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const EXPIRY_WINDOWS = ["vencidos", "30", "60", "90", "sin-vencimiento"] as const;
export type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number];

export const SORTS = ["riesgo", "antiguos", "recientes", "vencimiento"] as const;
export type DocumentSort = (typeof SORTS)[number];

export const PRIORITIES = ["urgent", "high", "normal"] as const;
export const VIAS = ["equipo", "solicitud"] as const;

export const PAGE_SIZE = 25;

export type DocumentFilters = {
  tab: DocumentTab;
  q: string;
  party: string;
  material: string;
  type: string;
  program: string;
  via: "" | (typeof VIAS)[number];
  priority: "" | ReviewPriority;
  expiry: "" | ExpiryWindow;
  lifecycle: Lifecycle;
  sort: DocumentSort;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const oneOf = <T extends string>(list: readonly T[], value: string): T | "" =>
  (list as readonly string[]).includes(value) ? (value as T) : "";

export const DEFAULT_FILTERS: DocumentFilters = {
  tab: "revisar",
  q: "",
  party: "",
  material: "",
  type: "",
  program: "",
  via: "",
  priority: "",
  expiry: "",
  lifecycle: "actuales",
  sort: "riesgo",
  page: 1,
};

const defaultSort = (tab: DocumentTab): DocumentSort => (tab === "revisar" ? "riesgo" : "recientes");

export function parseDocumentFilters(params: Params): DocumentFilters {
  const estado = first(params.estado);
  // Old links to the "Reemplazados" tab open Accepted, showing replaced versions.
  const replaced = estado === "reemplazados";
  const tab = replaced ? "aceptados" : oneOf(DOCUMENT_TABS, estado) || "revisar";
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    tab,
    q: first(params.q).trim().slice(0, 100),
    party: first(params.suplidor).slice(0, 80),
    material: first(params.material).slice(0, 80),
    type: first(params.tipo).slice(0, 40),
    program: first(params.programa).slice(0, 40),
    via: oneOf(VIAS, first(params.origen)),
    priority: oneOf(PRIORITIES, first(params.prioridad)),
    expiry: oneOf(EXPIRY_WINDOWS, first(params.vence)),
    lifecycle: replaced ? "reemplazados" : oneOf(LIFECYCLES, first(params.ciclo)) || "actuales",
    // The review queue defaults to risk first (then oldest); other tabs to newest.
    sort: oneOf(SORTS, first(params.orden)) || defaultSort(tab),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The URL query for a set of filters, leaving defaults out. */
export function documentsQuery(f: Partial<DocumentFilters>): string {
  const full = { ...DEFAULT_FILTERS, sort: defaultSort(f.tab ?? "revisar"), ...f };
  const p = new URLSearchParams();
  if (full.tab !== "revisar") p.set("estado", full.tab);
  if (full.q) p.set("q", full.q);
  if (full.party) p.set("suplidor", full.party);
  if (full.material) p.set("material", full.material);
  if (full.type) p.set("tipo", full.type);
  if (full.program) p.set("programa", full.program);
  if (full.via) p.set("origen", full.via);
  if (full.priority) p.set("prioridad", full.priority);
  if (full.expiry) p.set("vence", full.expiry);
  if (full.lifecycle !== "actuales") p.set("ciclo", full.lifecycle);
  if (full.sort !== defaultSort(full.tab)) p.set("orden", full.sort);
  if (full.page > 1) p.set("pagina", String(full.page));
  const query = p.toString();
  return query ? `?${query}` : "";
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Search looks at supplier, site, material, lot, file name and the document type in both languages. */
function haystack(row: DocumentRow): string {
  const type = findType(DEFAULT_CATALOG, row.typeCode);
  return fold(
    [row.partyName, row.site, row.materialName, row.lotCode, row.fileName, type?.name.es, type?.name.en]
      .filter(Boolean)
      .join(" "),
  );
}

function inTab(row: DocumentRow, f: Pick<DocumentFilters, "tab" | "lifecycle">): boolean {
  if (f.tab !== "aceptados") return row.state === TAB_STATE[f.tab];
  if (f.lifecycle === "reemplazados") return row.state === "superseded";
  if (f.lifecycle === "todas") return row.state === "accepted" || row.state === "superseded";
  return row.state === "accepted";
}

export function tabCounts(rows: DocumentRow[]): Record<DocumentTab, number> {
  const counts = { revisar: 0, aceptados: 0, rechazados: 0 };
  for (const row of rows) for (const tab of DOCUMENT_TABS) if (row.state === TAB_STATE[tab]) counts[tab]++;
  return counts;
}

function matchesExpiry(row: DocumentRow, window: ExpiryWindow, today: IsoDate): boolean {
  if (window === "sin-vencimiento") return row.expires === null;
  if (row.expires === null) return false;
  const days = daysBetween(today, row.expires);
  if (window === "vencidos") return days < 0;
  return days >= 0 && days <= Number(window);
}

/** Rows for the current filters, sorted (not paginated). */
export function filterDocuments(rows: DocumentRow[], f: DocumentFilters, today: IsoDate): DocumentRow[] {
  const q = fold(f.q);
  const byAge = (a: DocumentRow, b: DocumentRow) =>
    a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id);
  const sorters: Record<DocumentSort, (a: DocumentRow, b: DocumentRow) => number> = {
    antiguos: byAge,
    recientes: (a, b) => -byAge(a, b),
    riesgo: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byAge(a, b),
    vencimiento: (a, b) => (a.expires ?? "9999").localeCompare(b.expires ?? "9999") || byAge(a, b),
  };
  return rows
    .filter(
      (r) =>
        inTab(r, f) &&
        (!q || haystack(r).includes(q)) &&
        (!f.party || r.partyId === f.party) &&
        (!f.material || r.materialName === f.material) &&
        (!f.type || r.typeCode === f.type) &&
        (!f.program || r.requirements.some((x) => x.program === f.program)) &&
        (!f.via || (f.via === "solicitud" ? r.receivedVia === "portal" : r.receivedVia === "team")) &&
        (!f.priority || r.priority === f.priority) &&
        (!f.expiry || matchesExpiry(r, f.expiry, today)),
    )
    .sort(sorters[f.sort]);
}

export function paginate<T>(rows: T[], page: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  return { rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), page: current, pages };
}

/* Evidence gaps: from obligations, never from documents (a missing document is not a row above). */

export type GapRow = {
  key: string;
  code: RequirementCode;
  program: ProgramCode;
  status: Obligation["status"];
  blocking: boolean;
  partyId: string;
  partyName: string;
  site: string | null;
  materialName: string | null;
  /** How many materials rely on it. */
  sourceCount: number;
  /** An open request already asks for it. */
  requestId?: string;
  subject: DocumentSubject;
};

const GAP_STATUSES: ReadonlySet<Obligation["status"]> = new Set(["missing", "expired", "rejected", "awaiting_review"]);
const GAP_ORDER: Record<string, number> = { missing: 0, expired: 1, rejected: 2, awaiting_review: 3 };

export function evidenceGaps(ctx: ListContext): GapRow[] {
  const { data, obligations, requests } = ctx;
  const openRequest = new Map<string, string>();
  for (const r of requests) {
    if (r.state === "cancelled") continue;
    for (const i of r.items) {
      if (i.status !== "accepted" && i.status !== "waived") openRequest.set(i.requirementKey, r.id);
    }
  }
  const parties = new Map(data.parties.map((p) => [p.id, p.name]));
  return obligations
    .filter((o) => GAP_STATUSES.has(o.status))
    .map((o) => {
      const where = place(data, o.requirement.subject);
      return {
        key: o.requirement.key,
        code: o.requirement.code,
        program: o.requirement.program,
        status: o.status,
        blocking: o.requirement.blocking,
        ...where,
        partyName: parties.get(where.partyId) ?? "",
        sourceCount: o.requirement.sourceIds.length,
        requestId: openRequest.get(o.requirement.key),
        subject: o.requirement.subject,
      };
    })
    .sort(
      (a, b) =>
        Number(b.blocking) - Number(a.blocking) ||
        GAP_ORDER[a.status] - GAP_ORDER[b.status] ||
        a.partyName.localeCompare(b.partyName, "es"),
    );
}

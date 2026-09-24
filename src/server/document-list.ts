import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { IsoDate } from "@/domain/dates";
import { expirationOf } from "@/domain/status";
import type { DocumentState, SupplierDocument } from "@/domain/suppliers";

import type { SampleSupplierData, SampleUser } from "./sample/suppliers";

/*
 * The company-wide document list and its filters (?estado=revisar&q=…). Pure functions,
 * tested directly against the sample data; the service adds permissions around them.
 */

export type DocumentRow = {
  id: string;
  typeCode: string;
  state: DocumentState;
  /** The supplier: the party itself, or the manufacturer for material-level documents. */
  partyId: string;
  partyName: string;
  /** Material name for material-level documents; null for the supplier's own documents. */
  materialName: string | null;
  lotCode?: string;
  receivedOn: IsoDate;
  expires: IsoDate | null;
  uploadedBy: string;
  uploadedByName: string;
};

export function toDocumentRows(data: SampleSupplierData, users: SampleUser[]): DocumentRow[] {
  const parties = new Map(data.parties.map((p) => [p.id, p.name]));
  const materials = new Map(data.materials.map((m) => [m.id, m.name]));
  const sources = new Map(data.sources.map((s) => [s.id, s]));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  return data.documents.map((d: SupplierDocument) => {
    const source = d.subject.kind === "source" ? sources.get(d.subject.sourceId) : undefined;
    const partyId = d.subject.kind === "party" ? d.subject.partyId : (source?.manufacturerId ?? "");
    return {
      id: d.id,
      typeCode: d.typeCode,
      state: d.state,
      partyId,
      partyName: parties.get(partyId) ?? "",
      materialName: source ? (materials.get(source.materialId) ?? null) : null,
      lotCode: d.lotCode,
      receivedOn: d.receivedOn,
      expires: expirationOf(d, findType(DEFAULT_CATALOG, d.typeCode)),
      uploadedBy: d.uploadedBy,
      uploadedByName: userName(d.uploadedBy),
    };
  });
}

/** Tabs, with their Spanish URL value. "revisar" is the review queue and the default. */
export const DOCUMENT_TABS = ["revisar", "aceptados", "rechazados", "reemplazados", "todos"] as const;
export type DocumentTab = (typeof DOCUMENT_TABS)[number];

const TAB_STATE: Record<DocumentTab, DocumentState | null> = {
  revisar: "pending_review",
  aceptados: "accepted",
  rechazados: "rejected",
  reemplazados: "superseded",
  todos: null,
};

export type DocumentFilters = { tab: DocumentTab; q: string };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseDocumentFilters(params: Params): DocumentFilters {
  const tab = first(params.estado);
  return {
    tab: (DOCUMENT_TABS as readonly string[]).includes(tab) ? (tab as DocumentTab) : "revisar",
    q: first(params.q).trim().slice(0, 100),
  };
}

export function documentsQuery(f: DocumentFilters): string {
  const p = new URLSearchParams();
  if (f.tab !== "revisar") p.set("estado", f.tab);
  if (f.q) p.set("q", f.q);
  const query = p.toString();
  return query ? `?${query}` : "";
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Search looks at supplier, material, lot and the document type in both languages. */
function haystack(row: DocumentRow): string {
  const type = findType(DEFAULT_CATALOG, row.typeCode);
  return fold([row.partyName, row.materialName, row.lotCode, type?.name.es, type?.name.en].filter(Boolean).join(" "));
}

export function tabCounts(rows: DocumentRow[]): Record<DocumentTab, number> {
  const counts = Object.fromEntries(DOCUMENT_TABS.map((t) => [t, 0])) as Record<DocumentTab, number>;
  for (const row of rows) {
    counts.todos++;
    for (const tab of DOCUMENT_TABS) if (TAB_STATE[tab] === row.state) counts[tab]++;
  }
  return counts;
}

/**
 * Rows for a tab. The review queue is oldest first (first in, first reviewed);
 * every other tab is newest first.
 */
export function filterDocuments(rows: DocumentRow[], f: DocumentFilters): DocumentRow[] {
  const state = TAB_STATE[f.tab];
  const q = fold(f.q);
  const oldestFirst = f.tab === "revisar";
  return rows
    .filter((r) => (state === null || r.state === state) && (!q || haystack(r).includes(q)))
    .sort((a, b) => (oldestFirst ? 1 : -1) * a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id));
}

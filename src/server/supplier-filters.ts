import { isActiveSupplier } from "@/domain/operations";
import type { Approval, PartyType } from "@/domain/suppliers";

import type { SupplierRow } from "./suppliers";

/*
 * Supplier list filters and sort order. They live in the URL
 * (?q=&tipo=&aprobacion=&estado=&pendientes=1&orden=cumplimiento&dir=asc) so a list can be
 * bookmarked or shared, and the page works without JavaScript.
 */

export const TYPE_FILTERS = ["all", "manufacturer", "distributor"] as const;
export const APPROVAL_FILTERS = ["all", "approved", "conditional", "pending", "suspended"] as const;
/** active: approved or conditional and not deactivated (the panel's count). The rest are stages. */
export const STAGE_FILTERS = [
  "all",
  "active",
  "onboarding",
  "verification",
  "monitoring",
  "suspended",
  "inactive",
] as const;

export const SORT_KEYS = ["name", "type", "approval", "sources", "compliance"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** URL values are Spanish, like the rest of the URL. */
const SORT_PARAM: Record<SortKey, string> = {
  name: "nombre",
  type: "tipo",
  approval: "aprobacion",
  sources: "materiales",
  compliance: "cumplimiento",
};

/** Default: worst compliance first, the list a quality manager works from. */
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "compliance", dir: "asc" };

export type SupplierFilters = {
  q: string;
  type: (typeof TYPE_FILTERS)[number];
  approval: (typeof APPROVAL_FILTERS)[number];
  stage: (typeof STAGE_FILTERS)[number];
  /** Only suppliers with an expiring, expired or missing document. */
  attention: boolean;
  sort: SortKey;
  dir: SortDir;
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function oneOf<T extends string>(list: readonly T[], value: string): T {
  return (list as readonly string[]).includes(value) ? (value as T) : list[0];
}

export function parseFilters(params: Params): SupplierFilters {
  const sort = SORT_KEYS.find((k) => SORT_PARAM[k] === first(params.orden));
  const dir = first(params.dir);
  return {
    q: first(params.q).trim().slice(0, 100),
    type: oneOf(TYPE_FILTERS, first(params.tipo)),
    approval: oneOf(APPROVAL_FILTERS, first(params.aprobacion)),
    stage: oneOf(STAGE_FILTERS, first(params.estado)),
    attention: first(params.pendientes) === "1",
    sort: sort ?? DEFAULT_SORT.key,
    dir: dir === "asc" || dir === "desc" ? dir : sort ? "asc" : DEFAULT_SORT.dir,
  };
}

export function sortParam(key: SortKey): string {
  return SORT_PARAM[key];
}

/** Query string for the list with these filters; only non-default values are written. */
export function filtersQuery(f: SupplierFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.type !== "all") p.set("tipo", f.type);
  if (f.approval !== "all") p.set("aprobacion", f.approval);
  if (f.stage !== "all") p.set("estado", f.stage);
  if (f.attention) p.set("pendientes", "1");
  if (f.sort !== DEFAULT_SORT.key || f.dir !== DEFAULT_SORT.dir) {
    p.set("orden", SORT_PARAM[f.sort]);
    p.set("dir", f.dir);
  }
  const query = p.toString();
  return query ? `?${query}` : "";
}

/** The filters after clicking a column: the same column flips direction, a new one starts ascending. */
export function withSort(f: SupplierFilters, key: SortKey): SupplierFilters {
  return { ...f, sort: key, dir: f.sort === key && f.dir === "asc" ? "desc" : "asc" };
}

export function hasFilters(f: SupplierFilters): boolean {
  return f.q !== "" || f.type !== "all" || f.approval !== "all" || f.stage !== "all" || f.attention;
}

/** Lowercase without accents, so "cintron" finds "Cintrón". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function needsAttention(row: Pick<SupplierRow, "compliance">): boolean {
  const { expiring, expired, missing } = row.compliance.counts;
  return expiring + expired + missing > 0;
}

export function filterSuppliers<Row extends SupplierRow>(rows: Row[], f: SupplierFilters): Row[] {
  const q = fold(f.q);
  return rows.filter((row) => {
    if (q && !fold(`${row.name} ${row.city}`).includes(q)) return false;
    // A party that is both counts as a manufacturer and as a distributor.
    if (f.type !== "all" && row.type !== f.type && row.type !== "both") return false;
    if (f.approval !== "all" && row.approval !== (f.approval satisfies Approval)) return false;
    if (f.stage === "active" && !isActiveSupplier(row)) return false;
    if (f.stage !== "all" && f.stage !== "active" && row.lifecycle !== f.stage) return false;
    if (f.attention && !needsAttention(row)) return false;
    return true;
  });
}

const TYPE_ORDER: PartyType[] = ["manufacturer", "both", "distributor"];
const APPROVAL_ORDER: Approval[] = ["approved", "conditional", "pending", "suspended"];

const byName = (a: SupplierRow, b: SupplierRow) => a.name.localeCompare(b.name, "es");

const COMPARE: Record<SortKey, (a: SupplierRow, b: SupplierRow) => number> = {
  name: byName,
  type: (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  approval: (a, b) => APPROVAL_ORDER.indexOf(a.approval) - APPROVAL_ORDER.indexOf(b.approval),
  sources: (a, b) => a.activeSources - b.activeSources,
  compliance: (a, b) => a.compliance.percent - b.compliance.percent,
};

/** Sorts a copy. Ties are broken by name, always A→Z, so the order is stable. */
export function sortSuppliers<Row extends SupplierRow>(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * COMPARE[key](a, b) || byName(a, b));
}

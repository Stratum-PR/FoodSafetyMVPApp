import { APPROVAL_STATES, type ApprovalState } from "@/domain/approval";
import type { Risk } from "@/domain/suppliers";
import { isActiveSupplier } from "@/domain/operations";

import type { SupplierRow } from "./suppliers";

/*
 * Supplier list filters, sort order and page. They live in the URL
 * (?q=&tipo=&aprobacion=&riesgo=&pendientes=1&vence=1&orden=requisitos&dir=asc&pagina=2) so a
 * list can be bookmarked or shared, and the page works without JavaScript.
 */

export const APPROVAL_FILTERS = ["all", ...APPROVAL_STATES] as const;
export const RISK_FILTERS = ["all", "not_assessed", "high", "medium", "low"] as const;

export const TYPE_FILTERS = ["all", "manufacturer", "distributor"] as const;

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

export const SORT_KEYS = ["name", "approval", "risk", "materials", "requirements", "issues"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** URL values are Spanish, like the rest of the URL. */
const SORT_PARAM: Record<SortKey, string> = {
  name: "nombre",
  approval: "aprobacion",
  risk: "riesgo",
  materials: "materiales",
  requirements: "requisitos",
  issues: "incidencias",
};

/** Default: the lowest share of requirements met first, the list a quality manager works from. */
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "requirements", dir: "asc" };

export type SupplierFilters = {
  q: string;
  type: (typeof TYPE_FILTERS)[number];
  approval: (typeof APPROVAL_FILTERS)[number];
  risk: (typeof RISK_FILTERS)[number];
  stage: (typeof STAGE_FILTERS)[number];
  /** Only suppliers with a requirement that isn't met (missing, expired, rejected or awaiting review). */
  attention: boolean;
  /** Only suppliers with something expiring within 30 days. */
  expiring: boolean;
  sort: SortKey;
  dir: SortDir;
  /** 1-based. */
  page: number;
};

export const PAGE_SIZE = 15;

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
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    type: oneOf(TYPE_FILTERS, first(params.tipo)),
    approval: oneOf(APPROVAL_FILTERS, first(params.aprobacion)),
    risk: oneOf(RISK_FILTERS, first(params.riesgo)),
    stage: oneOf(STAGE_FILTERS, first(params.estado)),
    attention: first(params.pendientes) === "1",
    expiring: first(params.vence) === "1",
    sort: sort ?? DEFAULT_SORT.key,
    dir: dir === "asc" || dir === "desc" ? dir : sort ? "asc" : DEFAULT_SORT.dir,
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
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
  if (f.risk !== "all") p.set("riesgo", f.risk);
  if (f.stage !== "all") p.set("estado", f.stage);
  if (f.attention) p.set("pendientes", "1");
  if (f.expiring) p.set("vence", "1");
  if (f.sort !== DEFAULT_SORT.key || f.dir !== DEFAULT_SORT.dir) {
    p.set("orden", SORT_PARAM[f.sort]);
    p.set("dir", f.dir);
  }
  if (f.page > 1) p.set("pagina", String(f.page));
  const query = p.toString();
  return query ? `?${query}` : "";
}

/** The filters after clicking a column: the same column flips direction, a new one starts ascending. Back to page 1. */
export function withSort(f: SupplierFilters, key: SortKey): SupplierFilters {
  return { ...f, sort: key, dir: f.sort === key && f.dir === "asc" ? "desc" : "asc", page: 1 };
}

export function hasFilters(f: SupplierFilters): boolean {
  return (
    f.q !== "" ||
    f.type !== "all" ||
    f.approval !== "all" ||
    f.risk !== "all" ||
    f.stage !== "all" ||
    f.attention ||
    f.expiring
  );
}

/** Lowercase without accents, so "cintron" finds "Cintrón". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Requirements that aren't met: missing, expired, rejected or waiting for review. */
export function openRequirements(row: Pick<SupplierRow, "summary">): number {
  const c = row.summary.requirements.counts;
  return c.missing + c.expired + c.rejected + c.awaiting_review;
}

export function needsAttention(row: Pick<SupplierRow, "summary">): boolean {
  return openRequirements(row) > 0;
}

function hasExpiring(row: Pick<SupplierRow, "summary">): boolean {
  return row.summary.requirements.counts.expiring > 0 || row.summary.certification.status === "expiring";
}

export function filterSuppliers<Row extends SupplierRow>(rows: Row[], f: SupplierFilters): Row[] {
  const q = fold(f.q);
  return rows.filter((row) => {
    if (q && !fold(`${row.name} ${row.city}`).includes(q)) return false;
    // A party that is both counts as a manufacturer and as a distributor.
    if (f.type !== "all" && row.type !== f.type && row.type !== "both") return false;
    if (f.approval !== "all" && row.summary.state !== (f.approval satisfies ApprovalState)) return false;
    if (f.risk !== "all" && (row.summary.risk.rating ?? "not_assessed") !== f.risk) return false;
    if (f.stage === "active" && !isActiveSupplier({ approval: row.summary.state, lifecycle: row.lifecycle }))
      return false;
    if (f.stage !== "all" && f.stage !== "active" && row.lifecycle !== f.stage) return false;
    if (f.attention && !needsAttention(row)) return false;
    if (f.expiring && !hasExpiring(row)) return false;
    return true;
  });
}

const APPROVAL_ORDER: ApprovalState[] = [
  "approved",
  "conditional",
  "under_verification",
  "pending",
  "suspended",
  "rejected",
  "inactive",
];
const RISK_ORDER: (Risk | null)[] = ["low", "medium", "high", null];

const byName = (a: SupplierRow, b: SupplierRow) => a.name.localeCompare(b.name, "es");
/** Nothing required sorts after everything else, whichever the direction. */
const ratio = (r: SupplierRow) => r.summary.requirements.percent ?? 101;

const COMPARE: Record<SortKey, (a: SupplierRow, b: SupplierRow) => number> = {
  name: byName,
  approval: (a, b) => APPROVAL_ORDER.indexOf(a.summary.state) - APPROVAL_ORDER.indexOf(b.summary.state),
  risk: (a, b) => RISK_ORDER.indexOf(a.summary.risk.rating) - RISK_ORDER.indexOf(b.summary.risk.rating),
  materials: (a, b) => a.summary.materials.active - b.summary.materials.active,
  requirements: (a, b) => ratio(a) - ratio(b),
  issues: (a, b) => a.summary.issues.open - b.summary.issues.open,
};

/** Sorts a copy. Ties are broken by name, always A→Z, so the order is stable. */
export function sortSuppliers<Row extends SupplierRow>(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * COMPARE[key](a, b) || byName(a, b));
}

/** One page of rows. A page past the end shows the last one. */
export function paginate<Row>(rows: Row[], page: number): { rows: Row[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), page: current, pages };
}

/** Counts use the same derived approval and requirement state as the list. */
export function supplierStats(rows: Pick<SupplierRow, "type" | "summary" | "lifecycle">[]) {
  const active = (r: (typeof rows)[number]) => isActiveSupplier({ approval: r.summary.state, lifecycle: r.lifecycle });
  const group = (type: "manufacturer" | "distributor") => {
    const list = rows.filter((r) => r.type === type || r.type === "both");
    return { total: list.length, active: list.filter(active).length };
  };
  return {
    total: rows.length,
    active: rows.filter(active).length,
    manufacturers: group("manufacturer"),
    distributors: group("distributor"),
    attention: rows.filter(needsAttention).length,
  };
}

import type { Approval } from "@/domain/suppliers";

import type { SupplierRow } from "./suppliers";

/*
 * Supplier list filters. They live in the URL (?q=&tipo=&aprobacion=&pendientes=1) so a
 * filtered list can be bookmarked or shared, and the page works without JavaScript.
 */

export const TYPE_FILTERS = ["all", "manufacturer", "distributor"] as const;
export const APPROVAL_FILTERS = ["all", "approved", "conditional", "pending", "suspended"] as const;

export type SupplierFilters = {
  q: string;
  type: (typeof TYPE_FILTERS)[number];
  approval: (typeof APPROVAL_FILTERS)[number];
  /** Only suppliers with an expiring, expired or missing document. */
  attention: boolean;
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function oneOf<T extends string>(list: readonly T[], value: string): T {
  return (list as readonly string[]).includes(value) ? (value as T) : list[0];
}

export function parseFilters(params: Params): SupplierFilters {
  return {
    q: first(params.q).trim().slice(0, 100),
    type: oneOf(TYPE_FILTERS, first(params.tipo)),
    approval: oneOf(APPROVAL_FILTERS, first(params.aprobacion)),
    attention: first(params.pendientes) === "1",
  };
}

export function hasFilters(f: SupplierFilters): boolean {
  return f.q !== "" || f.type !== "all" || f.approval !== "all" || f.attention;
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
    if (f.attention && !needsAttention(row)) return false;
    return true;
  });
}

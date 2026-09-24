import { describe, expect, it } from "vitest";

import { filterSuppliers, hasFilters, parseFilters } from "./supplier-filters";
import type { SupplierRow } from "./suppliers";

function row(id: string, extra: Partial<SupplierRow> = {}): SupplierRow {
  return {
    id,
    name: id,
    type: "manufacturer",
    city: "Caguas",
    country: "PR",
    foreign: false,
    lifecycle: "monitoring",
    approval: "approved",
    activeSources: 1,
    compliance: { total: 3, percent: 100, counts: { current: 3, expiring: 0, expired: 0, missing: 0 } },
    ...extra,
  };
}

const rows = [
  row("Molinos Brisa Azul"),
  row("Distribuidora Cañaveral", { type: "distributor", city: "Bayamón" }),
  row("Frutas Monte Claro", {
    type: "both",
    approval: "pending",
    compliance: { total: 4, percent: 50, counts: { current: 2, expiring: 0, expired: 1, missing: 1 } },
  }),
];
const names = (list: SupplierRow[]) => list.map((r) => r.name);

describe("supplier filters", () => {
  it("reads the URL and ignores unknown values", () => {
    expect(parseFilters({})).toEqual({ q: "", type: "all", approval: "all", attention: false });
    const f = parseFilters({ q: "  azul ", tipo: "distributor", aprobacion: "hacked", pendientes: "1" });
    expect(f).toEqual({ q: "azul", type: "distributor", approval: "all", attention: true });
    expect(hasFilters(f)).toBe(true);
    expect(hasFilters(parseFilters({ tipo: ["manufacturer", "x"] }))).toBe(true);
  });

  it("searches name and city without caring about accents or case", () => {
    expect(names(filterSuppliers(rows, parseFilters({ q: "canaveral" })))).toEqual(["Distribuidora Cañaveral"]);
    expect(names(filterSuppliers(rows, parseFilters({ q: "BAYAMON" })))).toEqual(["Distribuidora Cañaveral"]);
  });

  it("counts a party that is both as manufacturer and distributor", () => {
    expect(names(filterSuppliers(rows, parseFilters({ tipo: "distributor" })))).toEqual([
      "Distribuidora Cañaveral",
      "Frutas Monte Claro",
    ]);
    expect(names(filterSuppliers(rows, parseFilters({ tipo: "manufacturer" })))).toEqual([
      "Molinos Brisa Azul",
      "Frutas Monte Claro",
    ]);
  });

  it("filters by approval and by pending documents", () => {
    expect(names(filterSuppliers(rows, parseFilters({ aprobacion: "pending" })))).toEqual(["Frutas Monte Claro"]);
    expect(names(filterSuppliers(rows, parseFilters({ pendientes: "1" })))).toEqual(["Frutas Monte Claro"]);
  });
});

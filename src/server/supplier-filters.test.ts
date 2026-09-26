import { describe, expect, it } from "vitest";

import { filtersQuery, filterSuppliers, hasFilters, parseFilters, sortSuppliers, withSort } from "./supplier-filters";
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
    expect(parseFilters({})).toEqual({
      q: "",
      type: "all",
      approval: "all",
      stage: "all",
      attention: false,
      sort: "compliance",
      dir: "asc",
    });
    const f = parseFilters({ q: "  azul ", tipo: "distributor", aprobacion: "hacked", pendientes: "1" });
    expect(f).toMatchObject({ q: "azul", type: "distributor", approval: "all", attention: true });
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

  it("filters active suppliers (approved or conditional, not deactivated) and by stage", () => {
    const more = [
      ...rows,
      row("Empaques Vega", { approval: "conditional" }),
      row("Harinas Loma", { lifecycle: "inactive" }),
      row("Sales Punta", { approval: "suspended", lifecycle: "suspended" }),
    ];
    expect(names(filterSuppliers(more, parseFilters({ estado: "active" })))).toEqual([
      "Molinos Brisa Azul",
      "Distribuidora Cañaveral",
      "Empaques Vega",
    ]);
    expect(names(filterSuppliers(more, parseFilters({ estado: "inactive" })))).toEqual(["Harinas Loma"]);
    expect(names(filterSuppliers(more, parseFilters({ estado: "suspended" })))).toEqual(["Sales Punta"]);
    expect(parseFilters({ estado: "nope" }).stage).toBe("all");
    expect(filtersQuery(parseFilters({ estado: "active" }))).toBe("?estado=active");
    expect(hasFilters(parseFilters({ estado: "active" }))).toBe(true);
  });
});

describe("supplier sorting", () => {
  it("reads the sort from the URL, in Spanish, and ignores unknown columns", () => {
    expect(parseFilters({ orden: "nombre" })).toMatchObject({ sort: "name", dir: "asc" });
    expect(parseFilters({ orden: "materiales", dir: "desc" })).toMatchObject({ sort: "sources", dir: "desc" });
    expect(parseFilters({ orden: "password", dir: "sideways" })).toMatchObject({ sort: "compliance", dir: "asc" });
  });

  it("flips the direction on the same column and starts ascending on a new one", () => {
    const f = parseFilters({ orden: "nombre" });
    expect(withSort(f, "name")).toMatchObject({ sort: "name", dir: "desc" });
    expect(withSort(withSort(f, "name"), "name")).toMatchObject({ dir: "asc" });
    expect(withSort({ ...f, dir: "desc" }, "type")).toMatchObject({ sort: "type", dir: "asc" });
  });

  it("writes only non-default values to the URL and keeps the filters", () => {
    expect(filtersQuery(parseFilters({}))).toBe("");
    expect(filtersQuery(parseFilters({ q: "sol", pendientes: "1", orden: "tipo", dir: "desc" }))).toBe(
      "?q=sol&pendientes=1&orden=tipo&dir=desc",
    );
  });

  it("sorts on every column, breaking ties by name", () => {
    expect(names(sortSuppliers(rows, "name", "asc"))).toEqual([
      "Distribuidora Cañaveral",
      "Frutas Monte Claro",
      "Molinos Brisa Azul",
    ]);
    expect(names(sortSuppliers(rows, "type", "asc"))).toEqual([
      "Molinos Brisa Azul",
      "Frutas Monte Claro",
      "Distribuidora Cañaveral",
    ]);
    expect(names(sortSuppliers(rows, "approval", "desc"))[0]).toBe("Frutas Monte Claro");
    expect(names(sortSuppliers(rows, "compliance", "asc"))).toEqual([
      "Frutas Monte Claro",
      "Distribuidora Cañaveral",
      "Molinos Brisa Azul",
    ]);
    const more = [...rows, row("Aceites Sol", { activeSources: 5 })];
    expect(names(sortSuppliers(more, "sources", "desc"))[0]).toBe("Aceites Sol");
    // Ties stay A→Z even when descending.
    expect(names(sortSuppliers(rows, "sources", "desc"))).toEqual(names(sortSuppliers(rows, "name", "asc")));
  });

  it("does not change the list it was given", () => {
    const copy = [...rows];
    sortSuppliers(rows, "name", "desc");
    expect(rows).toEqual(copy);
  });
});

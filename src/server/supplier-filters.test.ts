import { describe, expect, it } from "vitest";

import { summarizeObligations } from "@/domain/obligations";
import type { SupplierSummary } from "@/domain/supplier-summary";

import {
  filtersQuery,
  filterSuppliers,
  hasFilters,
  PAGE_SIZE,
  paginate,
  parseFilters,
  sortSuppliers,
  supplierStats,
  withSort,
} from "./supplier-filters";
import type { SupplierRow } from "./suppliers";

type Extra = Omit<Partial<SupplierRow>, "summary"> & { summary?: Partial<SupplierSummary> };

function summary(extra: Partial<SupplierSummary> = {}): SupplierSummary {
  return {
    partyId: "p",
    state: "approved",
    risk: { rating: "low" },
    materials: { active: 1, qualified: 1, notAssessed: 0, total: 1 },
    certification: { status: "verified", required: 1, verified: 1 },
    sites: [],
    requirements: { ...summarizeObligations([]), applicable: 3, met: 3, percent: 100 },
    fsma204: { status: "not_assessed" },
    issues: { open: 0, serious: 0 },
    nextAction: null,
    ...extra,
  };
}

function row(id: string, extra: Extra = {}): SupplierRow {
  return {
    id,
    name: id,
    type: "manufacturer",
    city: "Caguas",
    country: "PR",
    foreign: false,
    lifecycle: "monitoring",
    ...extra,
    summary: summary(extra.summary),
  };
}

const gaps = { ...summarizeObligations([]), applicable: 4, met: 2, percent: 50 };
gaps.counts = { ...gaps.counts, current: 2, expired: 1, missing: 1 };

const rows = [
  row("Molinos Brisa Azul"),
  row("Distribuidora Cañaveral", { type: "distributor", city: "Bayamón", summary: { risk: { rating: null } } }),
  row("Frutas Monte Claro", {
    type: "both",
    summary: {
      state: "under_verification",
      requirements: gaps,
      risk: { rating: "high" },
      issues: { open: 2, serious: 1 },
    },
  }),
];
const names = (list: SupplierRow[]) => list.map((r) => r.name);

describe("supplier filters", () => {
  it("reads the URL and ignores unknown values", () => {
    expect(parseFilters({})).toEqual({
      q: "",
      type: "all",
      approval: "all",
      risk: "all",
      stage: "all",
      attention: false,
      expiring: false,
      sort: "requirements",
      dir: "asc",
      page: 1,
    });
    const f = parseFilters({ q: "  azul ", tipo: "distributor", aprobacion: "hacked", pendientes: "1", pagina: "-3" });
    expect(f).toMatchObject({ q: "azul", type: "distributor", approval: "all", attention: true, page: 1 });
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
  });

  it("filters by approval state, risk (including not assessed) and open requirements", () => {
    expect(names(filterSuppliers(rows, parseFilters({ aprobacion: "under_verification" })))).toEqual([
      "Frutas Monte Claro",
    ]);
    expect(names(filterSuppliers(rows, parseFilters({ riesgo: "not_assessed" })))).toEqual(["Distribuidora Cañaveral"]);
    expect(names(filterSuppliers(rows, parseFilters({ riesgo: "high" })))).toEqual(["Frutas Monte Claro"]);
    expect(names(filterSuppliers(rows, parseFilters({ pendientes: "1" })))).toEqual(["Frutas Monte Claro"]);
  });

  it("filters active suppliers (approved or conditional, not deactivated) and by stage", () => {
    const more = [
      ...rows,
      row("Empaques Vega", { summary: { state: "conditional" } }),
      row("Harinas Loma", { lifecycle: "inactive" }),
      row("Sales Punta", { summary: { state: "suspended" }, lifecycle: "suspended" }),
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
    expect(parseFilters({ orden: "materiales", dir: "desc" })).toMatchObject({ sort: "materials", dir: "desc" });
    expect(parseFilters({ orden: "password", dir: "sideways" })).toMatchObject({ sort: "requirements", dir: "asc" });
  });

  it("flips the direction on the same column, starts ascending on a new one, and goes back to page 1", () => {
    const f = parseFilters({ orden: "nombre", pagina: "3" });
    expect(withSort(f, "name")).toMatchObject({ sort: "name", dir: "desc", page: 1 });
    expect(withSort(withSort(f, "name"), "name")).toMatchObject({ dir: "asc" });
    expect(withSort({ ...f, dir: "desc" }, "risk")).toMatchObject({ sort: "risk", dir: "asc" });
  });

  it("writes only non-default values to the URL and keeps the filters", () => {
    expect(filtersQuery(parseFilters({}))).toBe("");
    expect(filtersQuery(parseFilters({ q: "sol", pendientes: "1", orden: "riesgo", dir: "desc", pagina: "2" }))).toBe(
      "?q=sol&pendientes=1&orden=riesgo&dir=desc&pagina=2",
    );
  });

  it("sorts on every column, breaking ties by name", () => {
    expect(names(sortSuppliers(rows, "name", "asc"))).toEqual([
      "Distribuidora Cañaveral",
      "Frutas Monte Claro",
      "Molinos Brisa Azul",
    ]);
    expect(names(sortSuppliers(rows, "requirements", "asc"))[0]).toBe("Frutas Monte Claro");
    // Not assessed sorts after every rating.
    expect(names(sortSuppliers(rows, "risk", "asc"))).toEqual([
      "Molinos Brisa Azul",
      "Frutas Monte Claro",
      "Distribuidora Cañaveral",
    ]);
    expect(names(sortSuppliers(rows, "issues", "desc"))[0]).toBe("Frutas Monte Claro");
    expect(names(sortSuppliers(rows, "approval", "asc"))[2]).toBe("Frutas Monte Claro");
    // Ties stay A→Z even when descending.
    expect(names(sortSuppliers(rows, "materials", "desc"))).toEqual(names(sortSuppliers(rows, "name", "asc")));
  });

  it("does not change the list it was given", () => {
    const copy = [...rows];
    sortSuppliers(rows, "name", "desc");
    expect(rows).toEqual(copy);
  });
});

describe("paging", () => {
  it("cuts pages and keeps a page past the end on the last page", () => {
    const many = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => i);
    expect(paginate(many, 1)).toMatchObject({ page: 1, pages: 2 });
    expect(paginate(many, 2).rows).toEqual([PAGE_SIZE, PAGE_SIZE + 1, PAGE_SIZE + 2]);
    expect(paginate(many, 9).page).toBe(2);
    expect(paginate([], 1)).toEqual({ rows: [], page: 1, pages: 1 });
  });
});
describe("supplier pages", () => {
  it("reads the page from the URL and goes back to page 1 when the sort changes", () => {
    expect(parseFilters({ pagina: "3" }).page).toBe(3);
    expect(parseFilters({ pagina: "-2" }).page).toBe(1);
    expect(parseFilters({ pagina: "abc" }).page).toBe(1);
    expect(filtersQuery(parseFilters({ pagina: "2" }))).toBe("?pagina=2");
    expect(withSort(parseFilters({ pagina: "3" }), "name").page).toBe(1);
  });

  it("cuts the list in pages and keeps a page past the end on the last one", () => {
    const list = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => i);
    expect(paginate(list, 1)).toMatchObject({ page: 1, pages: 3 });
    expect(paginate(list, 3).rows).toEqual(list.slice(PAGE_SIZE * 2));
    expect(paginate(list, 99).page).toBe(3);
    expect(paginate([], 1)).toEqual({ rows: [], page: 1, pages: 1 });
  });
});

describe("supplier stats", () => {
  it("counts manufacturers and distributors, a party that is both in each", () => {
    const more = [...rows, row("Harinas Loma", { lifecycle: "inactive" })];
    expect(supplierStats(more)).toEqual({
      total: 4,
      active: 2,
      manufacturers: { total: 3, active: 1 },
      distributors: { total: 2, active: 1 },
      attention: 1,
    });
  });
});

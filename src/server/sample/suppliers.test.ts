import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { evaluateCompliance, summarize } from "@/domain/compliance";

import { SAMPLE_COMPANIES } from "./companies";
import { generateSampleSuppliers } from "./suppliers";

const TODAY = "2026-09-24";

describe("sample supplier data", () => {
  it("is the same every time for the same company and date", () => {
    expect(generateSampleSuppliers("alimentos-cordillera", TODAY)).toEqual(
      generateSampleSuppliers("alimentos-cordillera", TODAY),
    );
  });

  it("sizes the main company like a real mid-size plant", () => {
    const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
    expect(data.parties.length).toBeGreaterThanOrEqual(40);
    expect(data.parties.filter((p) => p.type === "distributor").length).toBeGreaterThanOrEqual(10);
    expect(data.materials.filter((m) => m.kind === "packaging").length).toBeGreaterThan(0);
  });

  it.each(SAMPLE_COMPANIES.map((c) => c.slug))("%s is consistent and shows every status", (slug) => {
    const data = generateSampleSuppliers(slug, TODAY);
    const ids = new Set(data.parties.map((p) => p.id));
    expect(new Set(data.parties.map((p) => p.name)).size).toBe(data.parties.length);

    for (const s of data.sources) {
      expect(ids.has(s.manufacturerId)).toBe(true);
      if (s.distributorId) expect(ids.has(s.distributorId)).toBe(true);
    }

    const summary = summarize(evaluateCompliance(data, data.documents, DEFAULT_CATALOG, TODAY));
    for (const status of ["current", "expiring", "expired", "missing"] as const) {
      expect(summary.counts[status], status).toBeGreaterThan(0);
    }
    // Realistic but not perfect.
    expect(summary.percent).toBeGreaterThan(55);
    expect(summary.percent).toBeLessThan(95);
    expect(data.documents.some((d) => d.state === "pending_review")).toBe(true);
    expect(data.parties.some((p) => p.lifecycle === "onboarding")).toBe(true);
  });

  it("uses only fictional names", () => {
    const text = JSON.stringify(SAMPLE_COMPANIES.map((c) => generateSampleSuppliers(c.slug, TODAY)));
    expect(text).not.toMatch(/nombre-real/i);
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { evaluateCompliance, summarize } from "@/domain/compliance";
import { documentVersions } from "@/domain/versions";

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

  it.each(SAMPLE_COMPANIES.map((c) => c.slug))("%s never has documents from the future", (slug) => {
    const future = generateSampleSuppliers(slug, TODAY).documents.filter(
      (d) => d.receivedOn > TODAY || (d.issuedOn ?? "") > TODAY,
    );
    expect(future.map((d) => d.id)).toEqual([]);
  });

  it("has every accepted document reviewed by someone other than its uploader", () => {
    const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
    for (const d of data.documents.filter((x) => x.state === "accepted")) {
      expect(d.reviewedBy).toBeDefined();
      expect(d.reviewedBy).not.toBe(d.uploadedBy);
      expect(d.reviewedOn! >= d.receivedOn && d.reviewedOn! <= TODAY).toBe(true);
    }
  });

  it("gives some documents an older history, never more than one active version", () => {
    const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
    const superseded = data.documents.filter((d) => d.state === "superseded");
    expect(superseded.length).toBeGreaterThan(10);
    for (const old of superseded) {
      const versions = documentVersions(old, data.documents);
      expect(versions.filter((d) => d.state === "accepted")).toHaveLength(1);
      expect(versions[0].state).toBe("accepted");
    }
  });

  it("uses only fictional names, built from the generator's generic words", () => {
    // "<Generic word> <Generic place> <legal suffix>", e.g. "Molinos Brisa Azul Inc."
    const generated =
      /^(Molinos|Productos|Industrias|Procesadora|Especias|Lácteos|Aceites|Harinas|Frutas|Conservas|Ingredientes|Cacaos|Envases|Empaques|Plásticos|Etiquetas|Cartonera|Distribuidora|Almacenes|Suministros|Importadora|Comercial) .+ (Inc\.|S\.A\. de C\.V\.|S\.R\.L\.|S\.A\.S\.|S\.A\.|S\.L\.)$/;
    for (const c of SAMPLE_COMPANIES) {
      for (const p of generateSampleSuppliers(c.slug, TODAY).parties) expect(p.name).toMatch(generated);
    }
  });
});

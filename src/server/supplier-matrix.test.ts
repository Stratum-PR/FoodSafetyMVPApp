import { describe, expect, it } from "vitest";

import { generateSampleSuppliers, SAMPLE_USERS } from "./sample/suppliers";
import { buildSupplierDetail } from "./supplier-detail";
import { buildMatrix, byDocument } from "./supplier-matrix";

const TODAY = "2026-09-24";
const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
const matrixOf = (partyId: string) => buildMatrix(buildSupplierDetail(data, partyId, TODAY, SAMPLE_USERS)!.sources);

describe("supplier document matrix", () => {
  const withBoth = data.parties.find((p) => {
    const kinds = new Set(
      data.sources
        .filter((s) => s.status === "active" && (s.manufacturerId === p.id || s.distributorId === p.id))
        .map((s) => data.materials.find((m) => m.id === s.materialId)!.kind),
    );
    return kinds.size === 2;
  });

  it("has a row per material bought today and a column per material-level document", () => {
    const party = data.parties.find((p) =>
      data.sources.some((s) => s.manufacturerId === p.id && s.status === "active"),
    )!;
    const matrix = matrixOf(party.id);
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(matrix.rows.every((r) => r.source.status === "active")).toBe(true);
    expect(matrix.documents).toContain("spec_sheet");
    // Supplier-level documents (certificates, questionnaire…) are not columns.
    expect(matrix.documents).not.toContain("gfsi_cert");
  });

  it("marks documents that don't apply to a material, like allergens for packaging", () => {
    if (!withBoth) return; // the sample may have no supplier with both kinds
    const matrix = matrixOf(withBoth.id);
    const packaging = matrix.rows.find((r) => r.source.material.kind === "packaging")!;
    expect(packaging.cells.allergen_statement).toBeNull();
    const ingredient = matrix.rows.find((r) => r.source.material.kind === "ingredient")!;
    expect(ingredient.cells.packaging_compliance).toBeNull();
  });

  it("counts what isn't current, per material and per document, consistently", () => {
    for (const party of data.parties.slice(0, 20)) {
      const matrix = matrixOf(party.id);
      const perMaterial = matrix.rows.reduce((n, r) => n + r.open, 0);
      const perDocument = byDocument(matrix).reduce((n, d) => n + d.open, 0);
      expect(perDocument).toBe(perMaterial);
      for (const row of matrix.rows) {
        const cells = Object.values(row.cells).filter((c) => c !== null);
        expect(row.required).toBe(cells.length);
        expect(row.open).toBe(cells.filter((c) => c!.status !== "current").length);
      }
    }
  });
});

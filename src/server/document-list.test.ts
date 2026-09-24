import { describe, expect, it } from "vitest";

import { documentsQuery, filterDocuments, parseDocumentFilters, tabCounts, toDocumentRows } from "./document-list";
import { generateSampleSuppliers, SAMPLE_USERS } from "./sample/suppliers";

const data = generateSampleSuppliers("alimentos-cordillera", "2026-09-24");
const rows = toDocumentRows(data, SAMPLE_USERS);

describe("document list", () => {
  it("names the supplier, material and uploader of every document", () => {
    expect(rows).toHaveLength(data.documents.length);
    expect(rows.every((r) => r.partyName && r.uploadedByName)).toBe(true);
    expect(rows.some((r) => r.materialName)).toBe(true);
    expect(rows.some((r) => r.materialName === null)).toBe(true);
  });

  it("reads the tab from the URL and defaults to the review queue", () => {
    expect(parseDocumentFilters({})).toEqual({ tab: "revisar", q: "" });
    expect(parseDocumentFilters({ estado: "todos", q: " coa " })).toEqual({ tab: "todos", q: "coa" });
    expect(parseDocumentFilters({ estado: "borrados" }).tab).toBe("revisar");
    expect(documentsQuery({ tab: "revisar", q: "" })).toBe("");
    expect(documentsQuery({ tab: "aceptados", q: "sal" })).toBe("?estado=aceptados&q=sal");
  });

  it("counts every tab", () => {
    const counts = tabCounts(rows);
    expect(counts.todos).toBe(rows.length);
    expect(counts.revisar + counts.aceptados + counts.rechazados + counts.reemplazados).toBe(rows.length);
    expect(counts.revisar).toBeGreaterThan(0);
  });

  it("lists the review queue oldest first and other tabs newest first", () => {
    const queue = filterDocuments(rows, { tab: "revisar", q: "" });
    expect(queue.every((r) => r.state === "pending_review")).toBe(true);
    const dates = queue.map((r) => r.receivedOn);
    expect(dates).toEqual([...dates].sort());

    const accepted = filterDocuments(rows, { tab: "aceptados", q: "" }).map((r) => r.receivedOn);
    expect(accepted).toEqual([...accepted].sort().reverse());
  });

  it("searches supplier, material and document type in either language", () => {
    const coa = filterDocuments(rows, { tab: "todos", q: "certificate of analysis" });
    expect(coa.length).toBeGreaterThan(0);
    expect(coa.every((r) => r.typeCode === "coa")).toBe(true);
    expect(filterDocuments(rows, { tab: "todos", q: "certificado de análisis" })).toEqual(coa);

    const supplier = rows[0].partyName;
    expect(filterDocuments(rows, { tab: "todos", q: supplier }).every((r) => r.partyName === supplier)).toBe(true);
  });
});

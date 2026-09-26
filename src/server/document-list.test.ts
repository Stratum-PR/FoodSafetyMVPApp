import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { evaluateObligations } from "@/domain/obligations";

import {
  DEFAULT_FILTERS,
  documentsQuery,
  evidenceGaps,
  filterDocuments,
  type ListContext,
  PAGE_SIZE,
  paginate,
  parseDocumentFilters,
  tabCounts,
  toDocumentRows,
} from "./document-list";
import { generateSampleSuppliers, SAMPLE_USERS } from "./sample/suppliers";

const TODAY = "2026-09-24";
const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
const obligations = evaluateObligations({
  data,
  documents: data.documents,
  overrides: data.overrides ?? [],
  catalog: DEFAULT_CATALOG,
  today: TODAY,
});
const ctx: ListContext = { data, obligations, requests: [], users: SAMPLE_USERS, today: TODAY };
const rows = toDocumentRows(ctx);
const f = (extra: Partial<typeof DEFAULT_FILTERS>) => ({ ...DEFAULT_FILTERS, ...extra });

describe("document list", () => {
  it("names the supplier, facility, material and uploader of every document", () => {
    expect(rows).toHaveLength(data.documents.length);
    expect(rows.every((r) => r.partyName && r.uploadedByName)).toBe(true);
    expect(rows.some((r) => r.subjectKind === "site" && r.site)).toBe(true);
    expect(rows.some((r) => r.materialName)).toBe(true);
  });

  it("links each document to the requirements it covers, with program and obligation count", () => {
    const cert = rows.find((r) => r.typeCode === "gfsi_cert" && r.state === "accepted")!;
    expect(cert.requirements.map((x) => x.code)).toContain("facility_certification");
    expect(cert.obligationCount).toBeGreaterThanOrEqual(cert.requirements.length);
  });

  it("numbers versions of the same record, oldest = 1", () => {
    const replaced = rows.find((r) => r.state === "superseded")!;
    const current = rows.find(
      (r) =>
        r.state === "accepted" &&
        r.typeCode === replaced.typeCode &&
        r.site === replaced.site &&
        r.partyId === replaced.partyId &&
        r.materialName === replaced.materialName,
    )!;
    expect(current.version).toBeGreaterThan(replaced.version);
  });

  it("reads filters from the URL, defaults to the review queue by risk, and round-trips", () => {
    expect(parseDocumentFilters({})).toEqual(DEFAULT_FILTERS);
    expect(parseDocumentFilters({ estado: "borrados" }).tab).toBe("revisar");
    const parsed = parseDocumentFilters({ estado: "aceptados", q: " sal ", vence: "30", prioridad: "urgent" });
    expect(parsed).toMatchObject({ tab: "aceptados", q: "sal", expiry: "30", priority: "urgent", sort: "recientes" });
    expect(parseDocumentFilters(Object.fromEntries(new URLSearchParams(documentsQuery(parsed))))).toEqual(parsed);
    expect(documentsQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("keeps old links to the replaced tab working, as a lifecycle filter of Accepted", () => {
    expect(parseDocumentFilters({ estado: "reemplazados" })).toMatchObject({
      tab: "aceptados",
      lifecycle: "reemplazados",
    });
    const replaced = filterDocuments(rows, f({ tab: "aceptados", lifecycle: "reemplazados" }), TODAY);
    expect(replaced.length).toBeGreaterThan(0);
    expect(replaced.every((r) => r.state === "superseded")).toBe(true);
    // Accepted shows only the versions in force by default.
    expect(filterDocuments(rows, f({ tab: "aceptados" }), TODAY).every((r) => r.state === "accepted")).toBe(true);
  });

  it("has three review-state tabs", () => {
    const counts = tabCounts(rows);
    expect(Object.keys(counts)).toEqual(["revisar", "aceptados", "rechazados"]);
    expect(counts.revisar).toBeGreaterThan(0);
  });

  it("sorts the queue by priority, then oldest first", () => {
    const queue = filterDocuments(rows, f({}), TODAY);
    expect(queue.every((r) => r.state === "pending_review")).toBe(true);
    const rank = { urgent: 0, high: 1, normal: 2 };
    for (let i = 1; i < queue.length; i++) {
      const [a, b] = [queue[i - 1], queue[i]];
      expect(rank[a.priority] < rank[b.priority] || (a.priority === b.priority && a.receivedOn <= b.receivedOn)).toBe(
        true,
      );
    }
  });

  it("filters by supplier, type, program and expiry window", () => {
    const party = rows[0].partyId;
    expect(filterDocuments(rows, f({ tab: "aceptados", party }), TODAY).every((r) => r.partyId === party)).toBe(true);
    const coa = filterDocuments(rows, f({ tab: "aceptados", type: "coa" }), TODAY);
    expect(coa.every((r) => r.typeCode === "coa")).toBe(true);
    const fsma = filterDocuments(rows, f({ tab: "aceptados", program: "fsma_core" }), TODAY);
    expect(fsma.every((r) => r.requirements.some((x) => x.program === "fsma_core"))).toBe(true);
    const soon = filterDocuments(rows, f({ tab: "aceptados", expiry: "30" }), TODAY);
    expect(soon.length).toBeGreaterThan(0);
    expect(soon.every((r) => r.expires !== null && r.expires >= TODAY)).toBe(true);
  });

  it("searches supplier, material and document type in either language", () => {
    const coa = filterDocuments(rows, f({ tab: "aceptados", q: "certificate of analysis" }), TODAY);
    expect(coa.length).toBeGreaterThan(0);
    expect(filterDocuments(rows, f({ tab: "aceptados", q: "certificado de análisis" }), TODAY)).toEqual(coa);
  });

  it("paginates", () => {
    const all = filterDocuments(rows, f({ tab: "aceptados" }), TODAY);
    const page = paginate(all, 2);
    expect(page.rows).toHaveLength(Math.min(PAGE_SIZE, all.length - PAGE_SIZE));
    expect(paginate(all, 999).page).toBe(page.pages);
  });
});

describe("evidence gaps", () => {
  const gaps = evidenceGaps(ctx);

  it("come from obligations, never from document rows", () => {
    expect(gaps.length).toBeGreaterThan(0);
    const missing = new Set(obligations.filter((o) => o.status === "missing").map((o) => o.requirement.key));
    expect(gaps.filter((g) => g.status === "missing").every((g) => missing.has(g.key))).toBe(true);
  });

  it("list blocking gaps first and point to an open request", () => {
    const firstOther = gaps.findIndex((g) => !g.blocking);
    expect(gaps.slice(firstOther === -1 ? gaps.length : firstOther).every((g) => !g.blocking)).toBe(true);
    const gap = gaps.find((g) => g.status === "missing")!;
    const withRequest = evidenceGaps({
      ...ctx,
      requests: [
        {
          id: "req-1",
          partyId: gap.partyId,
          contactId: "c",
          language: "es",
          dueOn: "2026-10-10",
          state: "sent",
          items: [
            {
              id: "i1",
              requirementKey: gap.key,
              code: gap.code,
              program: gap.program,
              subject: gap.subject,
              anyOf: [],
              reason: "manufacturer",
              status: "requested",
              documentIds: [],
              updatedAt: "",
            },
          ],
          createdBy: "u",
          createdAt: "",
          lastActivityAt: "",
        },
      ],
    });
    expect(withRequest.find((g) => g.key === gap.key)?.requestId).toBe("req-1");
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { summarizeSuppliers } from "@/domain/supplier-summary";

import { generateSampleSuppliers, SAMPLE_USERS } from "./sample/suppliers";
import { buildSupplierDetail } from "./supplier-detail";

const TODAY = "2026-09-24";
const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
const detail = (id: string) => buildSupplierDetail(data, id, TODAY, SAMPLE_USERS);

describe("supplier detail", () => {
  it("returns null for an unknown supplier", () => {
    expect(detail("p-nope")).toBeNull();
  });

  it("shows exactly the counts the supplier list shows", () => {
    const { summaries } = summarizeSuppliers(data, { catalog: DEFAULT_CATALOG, today: TODAY });
    for (const p of data.parties) {
      const d = detail(p.id)!;
      expect(d.summary).toEqual(summaries.get(p.id));
      // The page lists every obligation it counts.
      expect(d.obligations).toHaveLength(
        d.summary.requirements.applicable +
          d.summary.requirements.counts.waived +
          d.summary.requirements.counts.not_applicable,
      );
    }
  });

  it("splits obligations into the supplier's own, its sites' and each material's", () => {
    const maker = data.parties.find(
      (p) =>
        p.type === "manufacturer" && data.sources.some((s) => s.manufacturerId === p.id && s.commercial === "active"),
    )!;
    const d = detail(maker.id)!;
    const siteObligations = d.sites.flatMap((s) => s.obligations);
    expect(siteObligations.length).toBeGreaterThan(0);
    expect(siteObligations.every((o) => o.requirement.subject.kind === "site")).toBe(true);
    const active = d.sources.filter((s) => s.commercial === "active");
    expect(active.length).toBeGreaterThan(0);
    for (const s of active) {
      expect(s.role).toBe("manufacturer");
      expect(s.requirements.length).toBe(2);
      expect(s.site?.partyId).toBe(maker.id);
    }
    for (const s of d.sources.filter((x) => x.commercial !== "active")) expect(s.requirements).toEqual([]);
  });

  it("keeps the legacy site and a second plant apart, each with its own certification", () => {
    const multi = data.parties.find((p) => data.sites.filter((s) => s.partyId === p.id).length > 1)!;
    const d = detail(multi.id)!;
    expect(d.sites.map((s) => s.legacy)).toEqual([true, false]);
    expect(d.sites[0].certification.siteId).not.toBe(d.sites[1].certification.siteId);
  });

  it("shows a distributor what it sells and who makes it", () => {
    const dist = data.parties.find(
      (p) => p.type === "distributor" && data.sources.some((s) => s.distributorId === p.id),
    )!;
    const d = detail(dist.id)!;
    expect(d.sources.length).toBeGreaterThan(0);
    for (const s of d.sources) {
      expect(s.role).toBe("distributor");
      expect(s.counterpart?.name).toBeTruthy();
    }
  });

  it("lists every document for the supplier, its sites and its materials, newest first, with names", () => {
    const withDocs = data.parties.find((p) => detail(p.id)!.documents.some((doc) => doc.siteName !== null))!;
    const docs = detail(withDocs.id)!.documents;
    const dates = docs.map((doc) => doc.receivedOn);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(docs.every((doc) => doc.uploadedByName && !doc.uploadedByName.startsWith("u-"))).toBe(true);
    for (const doc of docs.filter((x) => x.typeCode === "coa")) expect(doc.expires).toBeNull();
  });
});

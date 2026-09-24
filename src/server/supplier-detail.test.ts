import { describe, expect, it } from "vitest";

import { generateSampleSuppliers, SAMPLE_USERS } from "./sample/suppliers";
import { buildSupplierDetail } from "./supplier-detail";

const TODAY = "2026-09-24";
const data = generateSampleSuppliers("alimentos-cordillera", TODAY);
const detail = (id: string) => buildSupplierDetail(data, id, TODAY, SAMPLE_USERS);

describe("supplier detail", () => {
  it("returns null for an unknown supplier", () => {
    expect(detail("p-nope")).toBeNull();
  });

  it("splits requirements into the supplier's own and each material's", () => {
    const maker = data.parties.find(
      (p) => p.type === "manufacturer" && data.sources.some((s) => s.manufacturerId === p.id && s.status === "active"),
    )!;
    const d = detail(maker.id)!;
    expect(d.partyRequirements.length).toBeGreaterThan(0);
    expect(d.partyRequirements.every((r) => r.requirement.subject.kind === "party")).toBe(true);
    const active = d.sources.filter((s) => s.status === "active");
    expect(active.length).toBeGreaterThan(0);
    for (const s of active) {
      expect(s.role).toBe("manufacturer");
      expect(s.requirements.length).toBe(2);
    }
    for (const s of d.sources.filter((x) => x.status !== "active")) expect(s.requirements).toEqual([]);
    // The page's compliance is the sum of what it shows.
    const shown = d.partyRequirements.length + d.sources.reduce((n, s) => n + s.requirements.length, 0);
    expect(d.compliance.total).toBe(shown);
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

  it("lists every document for the supplier and its materials, newest first, with names", () => {
    const withDocs = data.parties.find((p) => detail(p.id)!.documents.some((doc) => doc.materialName))!;
    const docs = detail(withDocs.id)!.documents;
    const dates = docs.map((doc) => doc.receivedOn);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(docs.every((doc) => doc.uploadedByName && !doc.uploadedByName.startsWith("u-"))).toBe(true);
    for (const doc of docs.filter((x) => x.typeCode === "coa")) expect(doc.expires).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "./catalog";
import { evaluateCompliance, resultsForParty, summarize } from "./compliance";
import { allRequirements, requirementsForSource, type SupplierData } from "./requirements";
import { documentStatus, evaluateRequirement, expirationOf } from "./status";
import type { ApprovedSource, Material, Party, SupplierDocument } from "./suppliers";

const TODAY = "2026-09-24";

function party(id: string, type: Party["type"], country = "PR"): Party {
  return { id, name: id, type, city: "", country, lifecycle: "monitoring", approval: "approved", createdBy: "u1" };
}
const sugar: Material = { id: "m-sugar", name: "Azúcar", code: "ING-001", kind: "ingredient" };
const bottle: Material = { id: "m-bottle", name: "Botella", code: "PKG-001", kind: "packaging" };

function source(id: string, materialId: string, manufacturerId: string, distributorId: string | null): ApprovedSource {
  return { id, materialId, manufacturerId, distributorId, status: "active", risk: "medium" };
}

let n = 0;
function doc(
  typeCode: string,
  subject: SupplierDocument["subject"],
  extra: Partial<SupplierDocument> = {},
): SupplierDocument {
  return { id: `d${++n}`, typeCode, subject, state: "accepted", receivedOn: "2026-06-01", uploadedBy: "u2", ...extra };
}

const codes = (list: { anyOf: readonly string[] }[]) => list.map((r) => r.anyOf.join("|")).sort();

describe("requirements", () => {
  it("asks a local manufacturer sold through a distributor for the default set", () => {
    const list = requirementsForSource(
      source("s1", sugar.id, "mfr", "dist"),
      sugar,
      party("mfr", "manufacturer"),
      party("dist", "distributor"),
    );
    const onManufacturer = list.filter((r) => r.subject.kind === "party" && r.subject.partyId === "mfr");
    const onDistributor = list.filter((r) => r.subject.kind === "party" && r.subject.partyId === "dist");
    const onSource = list.filter((r) => r.subject.kind === "source");

    expect(codes(onManufacturer)).toEqual(["fda_registration", "gfsi_cert|audit_report", "questionnaire"]);
    expect(codes(onDistributor)).toEqual(["gfsi_cert|audit_report", "guarantee_letter", "insurance", "questionnaire"]);
    expect(codes(onSource)).toEqual(["allergen_statement", "spec_sheet"]);
  });

  it("adds a hazard analysis for a foreign manufacturer (FSVP)", () => {
    const list = requirementsForSource(
      source("s1", sugar.id, "mfr", null),
      sugar,
      party("mfr", "manufacturer", "MX"),
      null,
    );
    expect(list.some((r) => r.reason === "fsvp" && r.anyOf[0] === "hazard_analysis")).toBe(true);
  });

  it("puts vendor requirements on the manufacturer when bought direct", () => {
    const list = requirementsForSource(source("s1", sugar.id, "mfr", null), sugar, party("mfr", "manufacturer"), null);
    const vendor = list.filter((r) => r.reason === "vendor");
    expect(vendor).toHaveLength(2);
    expect(vendor.every((r) => r.subject.kind === "party" && r.subject.partyId === "mfr")).toBe(true);
  });

  it("uses the packaging set for packaging", () => {
    const list = requirementsForSource(
      source("s1", bottle.id, "mfr", null),
      bottle,
      party("mfr", "manufacturer"),
      null,
    );
    expect(codes(list.filter((r) => r.subject.kind === "source"))).toEqual(["packaging_compliance", "spec_sheet"]);
  });

  it("counts party requirements once and skips inactive and rejected sources", () => {
    const data: SupplierData = {
      parties: [party("mfr", "manufacturer"), party("dist", "distributor")],
      materials: [sugar, bottle],
      sources: [
        source("s1", sugar.id, "mfr", "dist"),
        source("s2", bottle.id, "mfr", "dist"),
        { ...source("s3", sugar.id, "mfr", null), status: "inactive" },
        { ...source("s4", bottle.id, "mfr", null), status: "rejected" },
      ],
    };
    // 3 manufacturer + 4 distributor + 2 per active source.
    expect(allRequirements(data)).toHaveLength(3 + 4 + 2 + 2);
  });

  it("fails loudly on a source that points to a missing party", () => {
    const data: SupplierData = { parties: [], materials: [sugar], sources: [source("s1", sugar.id, "ghost", null)] };
    expect(() => allRequirements(data)).toThrow(/missing/);
  });
});

describe("document status", () => {
  const cert = DEFAULT_CATALOG.find((t) => t.code === "gfsi_cert");
  const coa = DEFAULT_CATALOG.find((t) => t.code === "coa");
  const subject = { kind: "party", partyId: "mfr" } as const;

  it("defaults to 12 months from the issue date, or from receipt", () => {
    expect(expirationOf(doc("gfsi_cert", subject, { issuedOn: "2026-01-10" }), cert)).toBe("2027-01-10");
    expect(expirationOf(doc("gfsi_cert", subject, { receivedOn: "2026-02-01" }), cert)).toBe("2027-02-01");
  });

  it("uses the printed expiration when there is one", () => {
    expect(expirationOf(doc("gfsi_cert", subject, { issuedOn: "2026-01-10", expiresOn: "2026-07-31" }), cert)).toBe(
      "2026-07-31",
    );
  });

  it("never expires per-lot documents", () => {
    expect(expirationOf(doc("coa", subject, { expiresOn: "2020-01-01" }), coa)).toBeNull();
  });

  it("is expiring within 30 days, valid through its date, then expired", () => {
    expect(documentStatus("2026-10-25", TODAY)).toBe("current");
    expect(documentStatus("2026-10-24", TODAY)).toBe("expiring");
    expect(documentStatus(TODAY, TODAY)).toBe("expiring");
    expect(documentStatus("2026-09-23", TODAY)).toBe("expired");
    expect(documentStatus(null, TODAY)).toBe("current");
  });

  it("counts only accepted documents of an accepted type for the same subject", () => {
    const requirement = { key: "k", subject, anyOf: ["gfsi_cert", "audit_report"], reason: "manufacturer" } as const;
    const others = [
      doc("gfsi_cert", subject, { state: "pending_review" }),
      doc("gfsi_cert", subject, { state: "rejected" }),
      doc("gfsi_cert", { kind: "party", partyId: "other" }),
      doc("questionnaire", subject),
    ];
    expect(evaluateRequirement(requirement, others, DEFAULT_CATALOG, TODAY).status).toBe("missing");

    const audit = doc("audit_report", subject, { issuedOn: "2026-05-01" });
    const result = evaluateRequirement(requirement, [...others, audit], DEFAULT_CATALOG, TODAY);
    expect(result.status).toBe("current");
    expect(result.document?.id).toBe(audit.id);
  });

  it("picks the best document when there are several", () => {
    const requirement = { key: "k", subject, anyOf: ["gfsi_cert"], reason: "manufacturer" } as const;
    const old = doc("gfsi_cert", subject, { expiresOn: "2026-08-01" });
    const soon = doc("gfsi_cert", subject, { expiresOn: "2026-10-01" });
    const renewed = doc("gfsi_cert", subject, { expiresOn: "2027-10-01" });
    expect(evaluateRequirement(requirement, [old, soon], DEFAULT_CATALOG, TODAY).status).toBe("expiring");
    const best = evaluateRequirement(requirement, [soon, renewed, old], DEFAULT_CATALOG, TODAY);
    expect(best.document?.id).toBe(renewed.id);
    expect(best.expiresOn).toBe("2027-10-01");
  });
});

describe("compliance", () => {
  const data: SupplierData = {
    parties: [party("mfr", "manufacturer"), party("dist", "distributor"), party("other", "manufacturer")],
    materials: [sugar],
    sources: [source("s1", sugar.id, "mfr", "dist"), source("s2", sugar.id, "other", null)],
  };

  it("is 100% when nothing is required", () => {
    expect(summarize([]).percent).toBe(100);
  });

  it("counts current and expiring as met and rounds down", () => {
    const m = { kind: "party", partyId: "mfr" } as const;
    const documents = [
      doc("gfsi_cert", m, { expiresOn: "2027-06-01" }),
      doc("questionnaire", m, { issuedOn: "2025-10-10" }), // expires 2026-10-10: expiring
      doc("fda_registration", m, { expiresOn: "2026-09-01" }), // expired
    ];
    const results = evaluateCompliance(data, documents, DEFAULT_CATALOG, TODAY);
    const summary = summarize(results);
    // mfr 3 + dist 4 + s1 2 + other 3 + other vendor 2 + s2 2
    expect(summary.total).toBe(16);
    expect(summary.counts).toEqual({ current: 1, expiring: 1, expired: 1, missing: 13 });
    expect(summary.percent).toBe(12); // 2/16 = 12.5%

    const forMfr = summarize(resultsForParty("mfr", results, data.sources));
    // Its own 3 + the source it makes (2).
    expect(forMfr.total).toBe(5);
    expect(forMfr.percent).toBe(40);
  });
});

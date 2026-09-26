import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "./catalog";
import { evaluateCompliance, resultsForParty, summarize } from "./compliance";
import { CATALOG_VERSION, REQUIREMENTS } from "./programs";
import { allRequirements, type Requirement, requirementsForSource, type SupplierData } from "./requirements";
import { documentStatus, evaluateRequirement, expirationOf } from "./status";
import {
  type ApprovedSource,
  backfillSource,
  legacySite,
  type Material,
  type Party,
  type SupplierDocument,
} from "./suppliers";

const TODAY = "2026-09-24";

function party(id: string, type: Party["type"], country = "PR"): Party {
  return {
    id,
    name: id,
    type,
    direction: "request",
    city: "",
    country,
    lifecycle: "monitoring",
    approval: "approved",
    createdBy: "u1",
  };
}
const sugar: Material = { id: "m-sugar", name: "Azúcar", code: "ING-001", kind: "ingredient" };
const bottle: Material = { id: "m-bottle", name: "Botella", code: "PKG-001", kind: "packaging" };

const siteOf = (partyId: string) => `${partyId}-site-legacy`;
function source(id: string, materialId: string, manufacturerId: string, distributorId: string | null): ApprovedSource {
  return backfillSource(
    { id, materialId, manufacturerId, distributorId, status: "active", risk: "medium" },
    siteOf(manufacturerId),
  );
}
const sitesFor = (parties: Party[]) => parties.map((p) => legacySite(p));

let n = 0;
function doc(
  typeCode: string,
  subject: SupplierDocument["subject"],
  extra: Partial<SupplierDocument> = {},
): SupplierDocument {
  return { id: `d${++n}`, typeCode, subject, state: "accepted", receivedOn: "2026-06-01", uploadedBy: "u2", ...extra };
}

const codes = (list: Requirement[]) => list.map((r) => r.code).sort();
const context = (s: ApprovedSource, material: Material, maker: Party, dist: Party | null) => ({
  source: s,
  material,
  manufacturer: maker,
  distributor: dist,
  distributorSiteId: dist ? siteOf(dist.id) : null,
});

describe("requirements", () => {
  it("asks a local manufacturer sold through a distributor for the default set, at the right scope", () => {
    const list = requirementsForSource(
      context(source("s1", sugar.id, "mfr", "dist"), sugar, party("mfr", "manufacturer"), party("dist", "distributor")),
    );
    const on = (kind: string, id: string) =>
      list.filter(
        (r) =>
          r.subject.kind === kind &&
          (r.subject.kind === "party"
            ? r.subject.partyId === id
            : r.subject.kind === "site"
              ? r.subject.siteId === id
              : r.subject.sourceId === id),
      );

    expect(codes(on("site", siteOf("mfr")))).toEqual(["facility_certification", "facility_registration"]);
    expect(codes(on("party", "mfr"))).toEqual(["questionnaire"]);
    expect(codes(on("site", siteOf("dist")))).toEqual(["facility_certification"]);
    expect(codes(on("party", "dist"))).toEqual(["guarantee_letter", "insurance", "questionnaire"]);
    expect(codes(on("source", "s1"))).toEqual(["allergen_statement", "specification"]);
  });

  it("carries program, severity, blocking, rule version and why it applies", () => {
    const list = requirementsForSource(
      context(source("s1", sugar.id, "mfr", null), sugar, party("mfr", "manufacturer"), null),
    );
    const registration = list.find((r) => r.code === "facility_registration")!;
    expect(registration).toMatchObject({
      program: "fsma_core",
      severity: "critical",
      blocking: true,
      ruleVersion: CATALOG_VERSION,
      sourceIds: ["s1"],
      anyOf: ["fda_registration"],
    });
    expect(list.find((r) => r.code === "questionnaire")).toMatchObject({
      program: "supplier_program",
      blocking: false,
    });
  });

  it("lets a company change which requirements block approval", () => {
    const list = requirementsForSource(
      context(source("s1", sugar.id, "mfr", null), sugar, party("mfr", "manufacturer"), null),
      REQUIREMENTS,
      { blocking: { facility_registration: false, specification: true } },
    );
    expect(list.find((r) => r.code === "facility_registration")?.blocking).toBe(false);
    expect(list.find((r) => r.code === "specification")?.blocking).toBe(true);
  });

  it("records the catalog version each obligation comes from", () => {
    const catalog = REQUIREMENTS.map((r) => (r.code === "insurance" ? { ...r, version: "2027-01-01" } : r));
    const list = requirementsForSource(
      context(source("s1", sugar.id, "mfr", null), sugar, party("mfr", "manufacturer"), null),
      catalog,
    );
    expect(list.find((r) => r.code === "insurance")?.ruleVersion).toBe("2027-01-01");
    expect(list.find((r) => r.code === "questionnaire")?.ruleVersion).toBe(CATALOG_VERSION);
  });

  it("adds a hazard analysis for a foreign manufacturer (FSVP)", () => {
    const list = requirementsForSource(
      context(source("s1", sugar.id, "mfr", null), sugar, party("mfr", "manufacturer", "MX"), null),
    );
    expect(list.some((r) => r.reason === "fsvp" && r.code === "fsvp_hazard_analysis")).toBe(true);
  });

  it("puts vendor requirements on the manufacturer when bought direct", () => {
    const list = requirementsForSource(
      context(source("s1", sugar.id, "mfr", null), sugar, party("mfr", "manufacturer"), null),
    );
    const vendor = list.filter((r) => r.reason === "vendor");
    expect(vendor).toHaveLength(2);
    expect(vendor.every((r) => r.subject.kind === "party" && r.subject.partyId === "mfr")).toBe(true);
  });

  it("uses the packaging set for packaging", () => {
    const list = requirementsForSource(
      context(source("s1", bottle.id, "mfr", null), bottle, party("mfr", "manufacturer"), null),
    );
    expect(codes(list.filter((r) => r.subject.kind === "source"))).toEqual(["food_contact", "specification"]);
  });

  it("counts requirements once, lists every source behind them, and skips sources not bought", () => {
    const parties = [party("mfr", "manufacturer"), party("dist", "distributor")];
    const data: SupplierData = {
      parties,
      sites: sitesFor(parties),
      materials: [sugar, bottle],
      sources: [
        source("s1", sugar.id, "mfr", "dist"),
        source("s2", bottle.id, "mfr", "dist"),
        { ...source("s3", sugar.id, "mfr", null), commercial: "inactive" },
      ],
    };
    const list = allRequirements(data);
    // mfr site 2 + mfr 1 + dist site 1 + dist 3 + 2 per active source.
    expect(list).toHaveLength(2 + 1 + 1 + 3 + 2 + 2);
    expect(list.find((r) => r.code === "questionnaire" && r.reason === "manufacturer")?.sourceIds).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("keeps a second plant's requirements apart from the first", () => {
    const maker = party("mfr", "manufacturer");
    const data: SupplierData = {
      parties: [maker],
      sites: [legacySite(maker), { ...legacySite(maker), id: "mfr-plant-2", legacy: false }],
      materials: [sugar, bottle],
      sources: [
        source("s1", sugar.id, "mfr", null),
        { ...source("s2", bottle.id, "mfr", null), siteId: "mfr-plant-2" },
      ],
    };
    const certs = allRequirements(data).filter((r) => r.code === "facility_certification");
    expect(certs.map((r) => (r.subject.kind === "site" ? r.subject.siteId : "")).sort()).toEqual([
      "mfr-plant-2",
      siteOf("mfr"),
    ]);
  });

  it("fails loudly on a source that points to a missing party", () => {
    const data: SupplierData = {
      parties: [],
      sites: [],
      materials: [sugar],
      sources: [source("s1", sugar.id, "ghost", null)],
    };
    expect(() => allRequirements(data)).toThrow(/missing/);
  });
});

describe("backfill", () => {
  it("moves the old location to a legacy site without inventing a name or kind", () => {
    const site = legacySite({ id: "p1", city: "Caguas", country: "PR", fei: "3001234567" });
    expect(site).toEqual({
      id: "p1-site-legacy",
      partyId: "p1",
      name: null,
      kind: null,
      city: "Caguas",
      country: "PR",
      fei: "3001234567",
      legacy: true,
    });
  });

  it("splits the old source status into commercial status and a qualification never assumed", () => {
    const base = { id: "s", materialId: "m", manufacturerId: "p", distributorId: null, risk: "low" as const };
    expect(backfillSource({ ...base, status: "active" }, "site")).toMatchObject({
      commercial: "active",
      qualification: { status: "not_assessed" },
      coaPolicy: "not_set",
      siteId: "site",
    });
    expect(backfillSource({ ...base, status: "inactive" }, "site")).toMatchObject({
      commercial: "inactive",
      qualification: { status: "not_assessed" },
    });
    expect(backfillSource({ ...base, status: "rejected" }, "site")).toMatchObject({
      commercial: "inactive",
      qualification: { status: "rejected" },
    });
  });
});

describe("document status", () => {
  const cert = DEFAULT_CATALOG.find((t) => t.code === "gfsi_cert");
  const coa = DEFAULT_CATALOG.find((t) => t.code === "coa");
  const subject = { kind: "site", siteId: "plant" } as const;
  const requirement = (anyOf: string[]): Requirement => ({
    key: "k",
    subject,
    anyOf,
    reason: "manufacturer",
    code: "facility_certification",
    program: "supplier_program",
    severity: "major",
    blocking: false,
    ruleVersion: CATALOG_VERSION,
    sourceIds: [],
  });

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

  it("counts only accepted documents of an accepted type for the same site", () => {
    const others = [
      doc("gfsi_cert", subject, { state: "pending_review" }),
      doc("gfsi_cert", subject, { state: "rejected" }),
      // Another plant's certificate never covers this one.
      doc("gfsi_cert", { kind: "site", siteId: "other-plant" }),
      doc("gfsi_cert", { kind: "party", partyId: "mfr" }),
      doc("questionnaire", subject),
    ];
    const req = requirement(["gfsi_cert", "audit_report"]);
    expect(evaluateRequirement(req, others, DEFAULT_CATALOG, TODAY).status).toBe("missing");

    const audit = doc("audit_report", subject, { issuedOn: "2026-05-01" });
    const result = evaluateRequirement(req, [...others, audit], DEFAULT_CATALOG, TODAY);
    expect(result.status).toBe("current");
    expect(result.document?.id).toBe(audit.id);
  });

  it("picks the best document when there are several", () => {
    const req = requirement(["gfsi_cert"]);
    const old = doc("gfsi_cert", subject, { expiresOn: "2026-08-01" });
    const soon = doc("gfsi_cert", subject, { expiresOn: "2026-10-01" });
    const renewed = doc("gfsi_cert", subject, { expiresOn: "2027-10-01" });
    expect(evaluateRequirement(req, [old, soon], DEFAULT_CATALOG, TODAY).status).toBe("expiring");
    const best = evaluateRequirement(req, [soon, renewed, old], DEFAULT_CATALOG, TODAY);
    expect(best.document?.id).toBe(renewed.id);
    expect(best.expiresOn).toBe("2027-10-01");
  });
});

describe("compliance", () => {
  const parties = [party("mfr", "manufacturer"), party("dist", "distributor"), party("other", "manufacturer")];
  const data: SupplierData = {
    parties,
    sites: sitesFor(parties),
    materials: [sugar],
    sources: [source("s1", sugar.id, "mfr", "dist"), source("s2", sugar.id, "other", null)],
  };

  it("is 100% when nothing is required", () => {
    expect(summarize([]).percent).toBe(100);
  });

  it("counts current and expiring as met and rounds down", () => {
    const plant = { kind: "site", siteId: siteOf("mfr") } as const;
    const documents = [
      doc("gfsi_cert", plant, { expiresOn: "2027-06-01" }),
      doc("questionnaire", { kind: "party", partyId: "mfr" }, { issuedOn: "2025-10-10" }), // expiring
      doc("fda_registration", plant, { expiresOn: "2026-09-01" }), // expired
    ];
    const results = evaluateCompliance(data, documents, DEFAULT_CATALOG, TODAY);
    const summary = summarize(results);
    // mfr 3 + dist 4 + s1 2 + other 3 + other vendor 2 + s2 2
    expect(summary.total).toBe(16);
    expect(summary.counts).toEqual({ current: 1, expiring: 1, expired: 1, missing: 13 });
    expect(summary.percent).toBe(12); // 2/16 = 12.5%

    const forMfr = summarize(resultsForParty("mfr", results, data));
    // Its site's 2 + its own 1 + the source it makes (2).
    expect(forMfr.total).toBe(5);
    expect(forMfr.percent).toBe(40);
  });
});

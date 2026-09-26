import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "./catalog";
import {
  activeOverride,
  checkOverride,
  evaluateObligations,
  type ObligationOverride,
  obligationsByParty,
  obligationsForParty,
  summarizeObligations,
} from "./obligations";
import { CATALOG_VERSION } from "./programs";
import type { SupplierData } from "./requirements";
import { backfillSource, legacySite, type Party, type SupplierDocument } from "./suppliers";

const TODAY = "2026-09-24";

function party(id: string, type: Party["type"]): Party {
  return {
    id,
    name: id,
    type,
    direction: "request",
    city: "Cayey",
    country: "PR",
    lifecycle: "monitoring",
    approval: "approved",
    createdBy: "u1",
  };
}
const maker = party("mfr", "manufacturer");
const dist = party("dist", "distributor");
const data: SupplierData = {
  parties: [maker, dist],
  sites: [legacySite(maker), legacySite(dist)],
  materials: [{ id: "m1", name: "Azúcar", code: "ING-001", kind: "ingredient" }],
  sources: [
    backfillSource(
      { id: "s1", materialId: "m1", manufacturerId: "mfr", distributorId: "dist", status: "active", risk: "low" },
      "mfr-site-legacy",
    ),
  ],
};
const plant = { kind: "site", siteId: "mfr-site-legacy" } as const;
const registrationKey = "site:mfr-site-legacy|facility_registration";
const insuranceKey = "party:dist|insurance";

let n = 0;
const doc = (typeCode: string, subject: SupplierDocument["subject"], extra: Partial<SupplierDocument> = {}) =>
  ({
    id: `d${++n}`,
    typeCode,
    subject,
    state: "accepted",
    receivedOn: "2026-06-01",
    uploadedBy: "u2",
    ...extra,
  }) satisfies SupplierDocument;

const evaluate = (documents: SupplierDocument[], overrides: ObligationOverride[] = []) =>
  evaluateObligations({ data, documents, overrides, catalog: DEFAULT_CATALOG, today: TODAY });
const statusOf = (key: string, documents: SupplierDocument[], overrides: ObligationOverride[] = []) =>
  evaluate(documents, overrides).find((o) => o.requirement.key === key)?.status;

const override = (extra: Partial<ObligationOverride>): ObligationOverride => ({
  id: `o${++n}`,
  key: insuranceKey,
  kind: "waived",
  reason: "Póliza en renovación",
  by: "u1",
  on: "2026-09-01",
  until: "2026-11-01",
  ruleVersion: CATALOG_VERSION,
  ...extra,
});

describe("obligation status", () => {
  it("is missing with no evidence at all: an obligation, not a fake document", () => {
    expect(statusOf(registrationKey, [])).toBe("missing");
  });

  it("is awaiting review when evidence arrived but nobody accepted it yet", () => {
    expect(statusOf(registrationKey, [doc("fda_registration", plant, { state: "pending_review" })])).toBe(
      "awaiting_review",
    );
  });

  it("is rejected when the last thing received was rejected and nothing valid is on file", () => {
    expect(statusOf(registrationKey, [doc("fda_registration", plant, { state: "rejected" })])).toBe("rejected");
  });

  it("takes the document status when there is accepted evidence, even with a waiting replacement", () => {
    const valid = doc("fda_registration", plant, { expiresOn: "2027-12-31" });
    const waiting = doc("fda_registration", plant, { state: "pending_review" });
    const o = evaluate([valid, waiting]).find((x) => x.requirement.key === registrationKey)!;
    expect(o.status).toBe("current");
    expect(o.pending?.id).toBe(waiting.id);
  });

  it("counts an expired document with a replacement waiting as awaiting review, so nobody asks again", () => {
    const expired = doc("fda_registration", plant, { expiresOn: "2026-08-01" });
    expect(statusOf(registrationKey, [expired])).toBe("expired");
    expect(statusOf(registrationKey, [expired, doc("fda_registration", plant, { state: "pending_review" })])).toBe(
      "awaiting_review",
    );
  });

  it("uses a waiver only while it lasts and only when nothing valid is on file", () => {
    expect(statusOf(insuranceKey, [], [override({})])).toBe("waived");
    expect(statusOf(insuranceKey, [], [override({ until: "2026-09-01" })])).toBe("missing");
    expect(statusOf(insuranceKey, [], [override({ withdrawnOn: "2026-09-10" })])).toBe("missing");
    const valid = doc("insurance", { kind: "party", partyId: "dist" }, { expiresOn: "2027-06-01" });
    expect(statusOf(insuranceKey, [valid], [override({})])).toBe("current");
  });

  it("marks an obligation not applicable with a person's reason, with no end date", () => {
    const na = override({ kind: "not_applicable", until: undefined });
    expect(statusOf(insuranceKey, [], [na])).toBe("not_applicable");
    expect(activeOverride([na], insuranceKey, "2030-01-01")?.id).toBe(na.id);
  });
});

describe("requirement summary", () => {
  it("defines the denominator as applicable, not waived; the numerator as current or expiring", () => {
    const list = evaluate(
      [
        doc("fda_registration", plant, { expiresOn: "2027-12-31" }),
        doc("questionnaire", { kind: "party", partyId: "mfr" }, { issuedOn: "2025-10-10" }), // expiring
      ],
      [override({}), override({ kind: "not_applicable", key: "party:dist|questionnaire", until: undefined })],
    );
    const summary = summarizeObligations(list);
    // mfr site 2 + mfr 1 + dist site 1 + dist 3 + source 2 = 9; the denominator leaves out the waived and N/A ones.
    expect(list).toHaveLength(9);
    expect(summary.counts.waived).toBe(1);
    expect(summary.counts.not_applicable).toBe(1);
    expect(summary.applicable).toBe(7);
    expect(summary.met).toBe(2);
    expect(summary.percent).toBe(28);
  });

  it("counts unmet blocking obligations separately", () => {
    expect(summarizeObligations(evaluate([])).blockingOpen).toBe(1); // FDA registration
    expect(
      summarizeObligations(evaluate([doc("fda_registration", plant, { expiresOn: "2027-12-31" })])).blockingOpen,
    ).toBe(0);
  });

  it("gives no percentage when nothing applies", () => {
    expect(summarizeObligations([]).percent).toBeNull();
  });

  it("groups by party in one pass with the same result as one party at a time", () => {
    const list = evaluate([]);
    const grouped = obligationsByParty(list, data.sites, data.sources);
    for (const p of data.parties) {
      expect(grouped.get(p.id)?.map((o) => o.requirement.key)).toEqual(
        obligationsForParty(p.id, list, data.sites, data.sources).map((o) => o.requirement.key),
      );
    }
  });
});

describe("waivers and not-applicable decisions", () => {
  it("need a reason, and a waiver needs an end date within the limit", () => {
    const max = "2027-09-24";
    expect(checkOverride({ kind: "", reason: "", until: "" }, TODAY, max)).toEqual({
      ok: false,
      errors: { kind: "required", reason: "required" },
    });
    expect(checkOverride({ kind: "waived", reason: "Póliza en renovación", until: "" }, TODAY, max)).toMatchObject({
      errors: { until: "required" },
    });
    expect(
      checkOverride({ kind: "waived", reason: "Póliza en renovación", until: "2028-01-01" }, TODAY, max),
    ).toMatchObject({ errors: { until: "date_too_far" } });
    expect(
      checkOverride(
        { kind: "not_applicable", reason: "Solo reempaca material sellado", until: "2027-01-01" },
        TODAY,
        max,
      ),
    ).toEqual({
      ok: true,
      value: { kind: "not_applicable", reason: "Solo reempaca material sellado", until: undefined },
    });
  });
});

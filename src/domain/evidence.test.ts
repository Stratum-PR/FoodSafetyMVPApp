import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "./catalog";
import {
  acceptanceImpact,
  checkInsurance,
  checkVerification,
  gfsiRecognized,
  isBlocking,
  isHighRisk,
  requirementsCoveredBy,
  reviewPriority,
} from "./evidence";
import { allRequirements, type SupplierData } from "./requirements";
import {
  type ApprovedSource,
  backfillSource,
  CHECKLIST_ITEMS,
  legacySite,
  type Party,
  type SupplierDocument,
} from "./suppliers";

const TODAY = "2026-09-24";
const ALL = [...CHECKLIST_ITEMS];

function party(id: string, type: Party["type"]): Party {
  return {
    id,
    name: id,
    type,
    direction: "request",
    city: "",
    country: "PR",
    lifecycle: "monitoring",
    approval: "approved",
    createdBy: "u",
  };
}
const src = (id: string, materialId: string, m: string, d: string | null, risk: ApprovedSource["risk"]) =>
  backfillSource({ id, materialId, manufacturerId: m, distributorId: d, status: "active", risk }, `${m}-site-legacy`);

const parties = [party("mfr", "manufacturer"), party("dist", "distributor"), party("mfr2", "manufacturer")];
const data: SupplierData = {
  parties,
  sites: parties.map(legacySite),
  materials: [
    { id: "sugar", name: "Azúcar", code: "I1", kind: "ingredient" },
    { id: "salt", name: "Sal", code: "I2", kind: "ingredient" },
  ],
  sources: [src("s1", "sugar", "mfr", "dist", "high"), src("s2", "salt", "mfr2", null, "low")],
};
const site = (partyId: string) => ({ kind: "site", siteId: `${partyId}-site-legacy` }) as const;
const requirements = allRequirements(data);

let n = 0;
function doc(typeCode: string, subject: SupplierDocument["subject"], extra: Partial<SupplierDocument> = {}) {
  return {
    id: `d${++n}`,
    typeCode,
    subject,
    state: "pending_review",
    receivedOn: "2026-09-01",
    issuedOn: "2026-09-01",
    uploadedBy: "u",
    ...extra,
  } satisfies SupplierDocument;
}

describe("verification checklist and details", () => {
  it("requires all six checks", () => {
    expect(checkVerification("questionnaire", { checklist: ALL }, TODAY)).toMatchObject({ ok: true });
    expect(checkVerification("questionnaire", { checklist: ALL.slice(1) }, TODAY)).toEqual({
      ok: false,
      errors: { checklist: "incomplete" },
    });
  });

  it("needs a GFSI certificate's details and a directory check; a free-text scheme is never recognized", () => {
    const base = {
      checklist: ALL,
      scheme: "fssc22000",
      scope: "Refinado de azúcar",
      issuingBody: "Certificadora Ejemplo",
      certificateNumber: "FS-123",
      facility: "Planta Caguas",
      auditDate: "2026-08-01",
      directoryVerified: true,
    };
    const ok = checkVerification("gfsi_cert", base, TODAY);
    expect(ok.ok && ok.verification.details).toMatchObject({ kind: "certificate", scheme: "fssc22000" });
    expect(ok.ok && gfsiRecognized(ok.verification.details as never)).toBe(true);

    expect(checkVerification("gfsi_cert", { ...base, scheme: "other" }, TODAY)).toMatchObject({
      ok: false,
      errors: { scheme: "not_recognized" },
    });
    expect(checkVerification("gfsi_cert", { ...base, scheme: "Mi esquema" }, TODAY)).toMatchObject({
      errors: { scheme: "not_recognized" },
    });
    expect(checkVerification("gfsi_cert", { ...base, directoryVerified: false }, TODAY)).toMatchObject({
      errors: { directoryVerified: "required" },
    });
    expect(checkVerification("gfsi_cert", { ...base, facility: " ", auditDate: "2027-01-01" }, TODAY)).toMatchObject({
      errors: { facility: "required", auditDate: "future_date" },
    });
    expect(gfsiRecognized({ ...(ok.ok ? ok.verification.details : {}), directoryVerified: false } as never)).toBe(
      false,
    );
  });

  it("reads the insurance coverage and compares it with the configured minimum", () => {
    const input = { checklist: ALL, insurer: "Aseguradora Ejemplo", policyNumber: "P-9", coverageUsd: "$1,000,000" };
    const ok = checkVerification("insurance", input, TODAY);
    expect(ok.ok && ok.verification.details).toEqual({
      kind: "insurance",
      insurer: "Aseguradora Ejemplo",
      policyNumber: "P-9",
      coverageUsd: 1_000_000,
    });
    expect(checkVerification("insurance", { ...input, coverageUsd: "mucho" }, TODAY)).toMatchObject({
      errors: { coverageUsd: "invalid_amount" },
    });
    expect(checkVerification("insurance", { ...input, coverageUsd: "0" }, TODAY)).toMatchObject({
      errors: { coverageUsd: "invalid_amount" },
    });
    expect(checkInsurance(1_000_000, 2_000_000)).toBe("below");
    expect(checkInsurance(2_000_000, 2_000_000)).toBe("meets");
    expect(checkInsurance(5, null)).toBe("no_threshold");
  });
});

describe("coverage, risk and priority", () => {
  it("links one document to every requirement it covers, and only those", () => {
    // The distributor site's GFSI certificate covers only its own facility, not the manufacturer's.
    const gfsi = doc("gfsi_cert", site("dist"));
    const covered = requirementsCoveredBy(gfsi, requirements);
    expect(covered.map((r) => r.key)).toEqual(["site:dist-site-legacy|facility_certification"]);
    // The spec sheet of one material doesn't cover another material's.
    const spec = doc("spec_sheet", { kind: "source", sourceId: "s1" });
    expect(requirementsCoveredBy(spec, requirements).map((r) => r.key)).toEqual(["source:s1|specification"]);
  });

  it("marks documents on or about high-risk materials as high risk", () => {
    expect(isHighRisk(doc("spec_sheet", { kind: "source", sourceId: "s1" }), data.sources, data.sites)).toBe(true);
    expect(isHighRisk(doc("spec_sheet", { kind: "source", sourceId: "s2" }), data.sources, data.sites)).toBe(false);
    expect(isHighRisk(doc("gfsi_cert", site("dist")), data.sources, data.sites)).toBe(true);
    expect(isHighRisk(doc("gfsi_cert", site("mfr2")), data.sources, data.sites)).toBe(false);
  });

  it("ranks blocking high-risk documents first", () => {
    expect(reviewPriority(true, true)).toBe("urgent");
    expect(reviewPriority(true, false)).toBe("high");
    expect(reviewPriority(false, true)).toBe("high");
    expect(reviewPriority(false, false)).toBe("normal");
  });

  it("is blocking when it would fill a missing requirement, not when one is already current", () => {
    const pending = doc("questionnaire", { kind: "party", partyId: "mfr2" });
    expect(isBlocking(pending, requirements, [pending], DEFAULT_CATALOG, TODAY)).toBe(true);
    const current = doc("questionnaire", { kind: "party", partyId: "mfr2" }, { state: "accepted" });
    expect(isBlocking(pending, requirements, [pending, current], DEFAULT_CATALOG, TODAY)).toBe(false);
  });
});

describe("acceptance impact", () => {
  it("shows the status each covered requirement goes from and to, before deciding", () => {
    const pending = doc("gfsi_cert", site("mfr"));
    expect(
      acceptanceImpact(pending, requirements, [pending], DEFAULT_CATALOG, TODAY).map((r) => [
        r.requirement.key,
        r.before,
        r.after,
      ]),
    ).toEqual([["site:mfr-site-legacy|facility_certification", "missing", "current"]]);
  });

  it("counts the replaced version as gone: an early renewal of a current certificate stays current", () => {
    const old = doc("gfsi_cert", site("mfr"), { state: "accepted", issuedOn: "2026-01-01" });
    const renewal = doc("gfsi_cert", site("mfr"));
    const [row] = acceptanceImpact(renewal, requirements, [old, renewal], DEFAULT_CATALOG, TODAY);
    expect([row.before, row.after]).toEqual(["current", "current"]);
  });

  it("an uploaded, unreviewed document never satisfies anything by itself", () => {
    const pending = doc("gfsi_cert", site("mfr"));
    const impact = acceptanceImpact(pending, requirements, [pending], DEFAULT_CATALOG, TODAY);
    expect(impact[0].before).toBe("missing");
  });
});

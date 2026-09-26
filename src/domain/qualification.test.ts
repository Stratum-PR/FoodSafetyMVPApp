import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "./catalog";
import { siteCertification, summarizeCertification } from "./certifications";
import { checkFsma204, currentFsma204, fsma204Hint } from "./fsma204";
import { checkClose, isOpen } from "./nonconformity";
import { evaluateObligations } from "./obligations";
import type { SupplierData } from "./requirements";
import { checkRiskAssessment, currentAssessment, DEFAULT_RISK_POLICY, suggestRating } from "./risk";
import { nextActionFor, summarizeSuppliers, type SupplierDataset } from "./supplier-summary";
import {
  backfillSource,
  type CertificateDetails,
  CHECKLIST_ITEMS,
  legacySite,
  type Party,
  type SupplierDocument,
} from "./suppliers";

const TODAY = "2026-09-24";

const maker: Party = {
  id: "mfr",
  name: "Molinos Ejemplo Inc.",
  type: "manufacturer",
  direction: "request",
  city: "Cayey",
  country: "PR",
  lifecycle: "monitoring",
  approval: "approved",
  terms: { reviewBy: "2027-06-01" },
  createdBy: "u1",
};
const plantA = legacySite(maker);
const plantB = { ...legacySite(maker), id: "mfr-plant-b", name: "Planta B", legacy: false };
const data: SupplierData = {
  parties: [maker],
  sites: [plantA, plantB],
  materials: [
    { id: "m1", name: "Azúcar", code: "ING-001", kind: "ingredient", onFtl: false },
    { id: "m2", name: "Queso fresco", code: "ING-002", kind: "ingredient", onFtl: true },
  ],
  sources: [
    backfillSource(
      { id: "s1", materialId: "m1", manufacturerId: "mfr", distributorId: null, status: "active", risk: "low" },
      plantA.id,
    ),
    backfillSource(
      { id: "s2", materialId: "m2", manufacturerId: "mfr", distributorId: null, status: "active", risk: "high" },
      plantB.id,
    ),
  ],
};

let n = 0;
const doc = (typeCode: string, siteId: string, extra: Partial<SupplierDocument> = {}): SupplierDocument => ({
  id: `d${++n}`,
  typeCode,
  subject: { kind: "site", siteId },
  state: "accepted",
  receivedOn: "2026-06-01",
  uploadedBy: "u2",
  ...extra,
});
const verified = (extra: Partial<SupplierDocument> = {}) =>
  doc("gfsi_cert", plantA.id, {
    expiresOn: "2027-05-01",
    verification: {
      checklist: CHECKLIST_ITEMS,
      details: {
        kind: "certificate",
        scheme: "sqf",
        scope: "Ingredientes secos",
        issuingBody: "Certificadora Ejemplo",
        certificateNumber: "C-1",
        facility: "Planta A",
        directoryVerified: true,
      },
    },
    ...extra,
  });

const obligationsWith = (documents: SupplierDocument[]) =>
  evaluateObligations({ data, documents, overrides: [], catalog: DEFAULT_CATALOG, today: TODAY });
const certOf = (siteId: string, documents: SupplierDocument[]) =>
  siteCertification({ id: siteId }, documents, obligationsWith(documents), DEFAULT_CATALOG, TODAY);

describe("facility certification", () => {
  it("is verified only with recorded details and a directory check, never from a PDF alone", () => {
    expect(certOf(plantA.id, [verified()]).status).toBe("verified");
    expect(certOf(plantA.id, [doc("gfsi_cert", plantA.id, { expiresOn: "2027-05-01" })]).status).toBe(
      "pending_verification",
    );
    const unchecked = verified();
    unchecked.verification = {
      ...unchecked.verification!,
      details: { ...(unchecked.verification!.details as CertificateDetails), directoryVerified: false },
    };
    expect(certOf(plantA.id, [unchecked]).status).toBe("pending_verification");
  });

  it("belongs to one facility: plant A's certificate leaves plant B missing", () => {
    const documents = [verified()];
    expect(certOf(plantA.id, documents).status).toBe("verified");
    expect(certOf(plantB.id, documents).status).toBe("missing");
    const summary = summarizeCertification([certOf(plantA.id, documents), certOf(plantB.id, documents)]);
    expect(summary).toMatchObject({ status: "missing", required: 2, verified: 1 });
  });

  it("shows expired, expiring, audit-only and waiting states", () => {
    expect(certOf(plantA.id, [verified({ expiresOn: "2026-09-01" })]).status).toBe("expired");
    expect(certOf(plantA.id, [verified({ expiresOn: "2026-10-10" })]).status).toBe("expiring");
    expect(certOf(plantA.id, [doc("audit_report", plantA.id, { issuedOn: "2026-05-01" })]).status).toBe("audit_only");
    expect(certOf(plantA.id, [doc("gfsi_cert", plantA.id, { state: "pending_review" })]).status).toBe(
      "pending_verification",
    );
  });

  it("is not assessed for a site nothing is bought from", () => {
    const idle = siteCertification({ id: "idle" }, [], obligationsWith([]), DEFAULT_CATALOG, TODAY);
    expect(idle).toMatchObject({ status: "not_assessed", required: false });
  });
});

describe("risk assessment", () => {
  const factors = {
    material_hazard: "high",
    origin: "low",
    certification: "low",
    history: "low",
    allergens: "low",
  } as const;

  it("suggests from the factors under the policy, but the assessor decides", () => {
    expect(suggestRating(factors, DEFAULT_RISK_POLICY)).toBe("high");
    expect(suggestRating(factors, { ...DEFAULT_RISK_POLICY, highIfAnyHigh: false })).toBe("medium");
    expect(suggestRating({ ...factors, material_hazard: "low" }, DEFAULT_RISK_POLICY)).toBe("low");
    const result = checkRiskAssessment(
      {
        ...factors,
        rating: "medium",
        rationale: "Controles de humedad verificados en sitio.",
        nextReviewOn: "2027-03-01",
      },
      DEFAULT_RISK_POLICY,
      TODAY,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { suggested: "high", rating: "medium", policyVersion: "2026-09-26" },
    });
  });

  it("needs every factor, a rating, a rationale and a future review date", () => {
    const result = checkRiskAssessment(
      { ...factors, origin: "", rating: "", rationale: "corto", nextReviewOn: TODAY },
      DEFAULT_RISK_POLICY,
      TODAY,
    );
    expect(result).toEqual({
      ok: false,
      errors: { origin: "required", rating: "required", rationale: "too_short", nextReviewOn: "date_not_future" },
    });
  });

  it("keeps every version; the latest is current, and a policy change never rewrites it", () => {
    const base = {
      partyId: "mfr",
      factors,
      suggested: "high" as const,
      rating: "high" as const,
      rationale: "x",
      assessedBy: "u1",
      assessedOn: TODAY,
      nextReviewOn: "2027-01-01",
    };
    const list = [
      { ...base, id: "r1", version: 1, policyVersion: "2025-06-01" },
      { ...base, id: "r2", version: 2, policyVersion: "2026-09-26", rating: "medium" as const },
    ];
    expect(currentAssessment(list, "mfr")?.id).toBe("r2");
    expect(list[0].policyVersion).toBe("2025-06-01");
    expect(currentAssessment(list, "other")).toBeUndefined();
  });
});

describe("FSMA 204 applicability", () => {
  it("only hints from the materials; never decides", () => {
    expect(fsma204Hint([{ onFtl: true }, { onFtl: false }])).toBe("ftl_materials");
    expect(fsma204Hint([{ onFtl: false }])).toBe("no_ftl_materials");
    expect(fsma204Hint([{ onFtl: false }, {}])).toBe("materials_not_checked");
    expect(currentFsma204([], "mfr")).toBeUndefined();
  });

  it("needs a rationale, and an exemption needs the exemption relied on", () => {
    expect(checkFsma204({ decision: "exempt", rationale: "Recibe un paso letal.", exemption: "" })).toEqual({
      ok: false,
      errors: { exemption: "required" },
    });
    expect(checkFsma204({ decision: "applicable", rationale: "Suple queso fresco.", exemption: "ignored" })).toEqual({
      ok: true,
      value: { decision: "applicable", rationale: "Suple queso fresco.", exemption: undefined },
    });
    expect(checkFsma204({ decision: "maybe", rationale: "", exemption: "" })).toMatchObject({
      errors: { decision: "invalid", rationale: "required" },
    });
  });
});

describe("issues", () => {
  it("stay open until closed with a note", () => {
    expect(isOpen({})).toBe(true);
    expect(isOpen({ status: "closed" })).toBe(false);
    expect(checkClose({ status: "open" }, "")).toBe("required");
    expect(checkClose({ status: "closed" }, "Acción verificada")).toBe("already_closed");
    expect(checkClose({ status: "open" }, "Acción verificada")).toBeNull();
  });
});

describe("supplier summary", () => {
  const dataset = (extra: Partial<SupplierDataset> = {}): SupplierDataset => ({
    ...data,
    contacts: [],
    documents: [],
    approvals: [],
    nonconformities: [],
    riskAssessments: [],
    fsma204: [],
    overrides: [],
    ...extra,
  });
  const summaryOf = (ds: SupplierDataset) =>
    summarizeSuppliers(ds, { catalog: DEFAULT_CATALOG, today: TODAY }).summaries.get("mfr")!;

  it("never rates or approves anything nobody assessed", () => {
    const s = summaryOf(dataset());
    expect(s.risk.rating).toBeNull();
    expect(s.fsma204.status).toBe("not_assessed");
    expect(s.materials).toEqual({ active: 2, qualified: 0, notAssessed: 2, total: 2 });
  });

  it("counts open issues only, and serious ones separately", () => {
    const nc = (id: string, severity: "minor" | "major", status?: "open" | "closed") => ({
      id,
      partyId: "mfr",
      date: "2026-09-01",
      severity,
      description: "Lote sin COA",
      recordedBy: "u1",
      recordedOn: "2026-09-01",
      status,
    });
    const s = summaryOf(dataset({ nonconformities: [nc("a", "major"), nc("b", "minor"), nc("c", "major", "closed")] }));
    expect(s.issues).toEqual({ open: 2, serious: 1 });
  });

  it("points the next action at the blocking gap first", () => {
    const s = summaryOf(dataset());
    expect(s.nextAction).toMatchObject({ kind: "blocking_gap", count: 2 });
  });

  it("orders the next action: overdue review, blocking gap, review, issue, gap, decision, risk", () => {
    const base = {
      state: "approved" as const,
      obligations: [],
      pendingDocuments: [],
      openIssues: [],
      riskAssessed: true,
      fsma204: "applicable" as const,
      hasFtlMaterials: false,
      today: TODAY,
    };
    expect(nextActionFor({ ...base, reviewBy: "2026-09-01" })).toEqual({ kind: "review_overdue", since: "2026-09-01" });
    expect(nextActionFor({ ...base, riskAssessed: false })).toEqual({ kind: "assess_risk" });
    expect(nextActionFor({ ...base, state: "under_verification" })).toEqual({ kind: "decide_approval" });
    expect(nextActionFor({ ...base, fsma204: "not_assessed", hasFtlMaterials: true })).toEqual({
      kind: "assess_fsma204",
    });
    expect(nextActionFor({ ...base, state: "rejected", reviewBy: "2026-09-01" })).toBeNull();
    expect(nextActionFor(base)).toBeNull();
  });

  it("updates when a correctly scoped document is accepted, with no second calculation", () => {
    const registrations = [doc("fda_registration", plantA.id), doc("fda_registration", plantB.id)];
    const before = summaryOf(dataset({ documents: registrations.map((d) => ({ ...d, state: "pending_review" })) }));
    const after = summaryOf(dataset({ documents: registrations }));
    expect(before.requirements.counts.awaiting_review).toBe(2);
    expect(before.requirements.blockingOpen).toBe(2);
    expect(after.requirements.blockingOpen).toBe(0);
    expect(after.requirements.met).toBe(before.requirements.met + 2);
  });
});

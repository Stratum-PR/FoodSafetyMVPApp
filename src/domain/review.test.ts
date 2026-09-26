import { describe, expect, it } from "vitest";

import type { VerificationInput } from "./evidence";
import { checkCanAccept, checkCanReview, type ReviewInput, reviewDocument } from "./review";
import { CHECKLIST_ITEMS, type SupplierDocument } from "./suppliers";

const TODAY = "2026-09-24";
const qm = { userId: "ana", role: "quality_manager" } as const;
const staff = { userId: "sam", role: "staff" } as const;
const party = { kind: "party", partyId: "p1" } as const;
const FILE = { key: "k", name: "q.pdf", size: 10, contentType: "application/pdf", sha256: "ab12" } as const;
const CHECKED: VerificationInput = { checklist: [...CHECKLIST_ITEMS] };

function doc(id: string, extra: Partial<SupplierDocument> = {}): SupplierDocument {
  return {
    id,
    typeCode: "questionnaire",
    subject: party,
    state: "pending_review",
    receivedOn: "2026-09-01",
    uploadedBy: "luis",
    file: FILE,
    ...extra,
  };
}

function review(d: SupplierDocument, extra: Partial<ReviewInput> = {}) {
  return reviewDocument({
    doc: d,
    others: [],
    actor: qm,
    decision: "accept",
    reason: "",
    today: TODAY,
    perLot: false,
    verification: CHECKED,
    ...extra,
  });
}

describe("document review", () => {
  it("accepts a pending document and records who, when and what was checked", () => {
    expect(review(doc("d1"))).toMatchObject({
      ok: true,
      document: {
        state: "accepted",
        reviewedBy: "ana",
        reviewedOn: TODAY,
        verification: { checklist: [...CHECKLIST_ITEMS] },
      },
      superseded: [],
    });
  });

  it("never accepts a document without a stored, hashed file (sample rows are not proof)", () => {
    const noFile = doc("d1", { file: undefined });
    expect(checkCanAccept(noFile)).toBe("no_file");
    expect(review(noFile)).toEqual({ ok: false, denial: "no_file" });
    // It can still be rejected.
    expect(review(noFile, { decision: "reject", reason: "No llegó el archivo." })).toMatchObject({ ok: true });
    // A file without its hash isn't enough either.
    expect(review(doc("d2", { file: { ...FILE, sha256: undefined } }))).toEqual({ ok: false, denial: "no_file" });
  });

  it("needs every checklist item to accept", () => {
    const result = review(doc("d1"), { verification: { checklist: ["identity", "dates"] } });
    expect(result).toEqual({ ok: false, denial: "verification_invalid", errors: { checklist: "incomplete" } });
  });

  it("lets the uploader review their own document by default (small teams)", () => {
    const mine = doc("d1", { uploadedBy: "ana" });
    expect(checkCanReview(qm, mine)).toBeNull();
    expect(review(mine)).toMatchObject({ ok: true, document: { uploadedBy: "ana", reviewedBy: "ana" } });
  });

  it("requires a second person when the company asks for it", () => {
    const mine = doc("d1", { uploadedBy: "ana" });
    const strict = { requireSecondPerson: true };
    expect(checkCanReview(qm, mine, strict)).toBe("own_upload");
    expect(review(mine, { policy: strict })).toEqual({ ok: false, denial: "own_upload" });
  });

  it("keeps high-risk evidence for a final review by a role that approves suppliers", () => {
    expect(checkCanReview(staff, doc("d1"), undefined, true)).toBe("final_review_required");
    expect(review(doc("d1"), { actor: staff, highRisk: true })).toEqual({
      ok: false,
      denial: "final_review_required",
    });
    expect(review(doc("d1"), { actor: staff })).toMatchObject({ ok: true });
    expect(review(doc("d1"), { highRisk: true })).toMatchObject({ ok: true });
  });

  it("needs the review permission", () => {
    expect(review(doc("d1"), { actor: { userId: "w", role: "warehouse" } })).toEqual({
      ok: false,
      denial: "no_permission",
    });
  });

  it("only decides documents that are waiting for review", () => {
    for (const state of ["accepted", "rejected", "superseded"] as const) {
      expect(review(doc("d1", { state }))).toEqual({ ok: false, denial: "not_pending" });
    }
  });

  it("requires a reason to reject, and keeps it trimmed", () => {
    expect(review(doc("d1"), { decision: "reject", reason: "  no " })).toEqual({
      ok: false,
      denial: "reason_required",
    });
    expect(review(doc("d1"), { decision: "reject", reason: "x".repeat(501) })).toEqual({
      ok: false,
      denial: "reason_too_long",
    });
    expect(review(doc("d1"), { decision: "reject", reason: "  Certificado vencido  " })).toMatchObject({
      ok: true,
      document: { state: "rejected", rejectionReason: "Certificado vencido" },
    });
  });

  it("replaces only the previous accepted version of the same record", () => {
    const old = doc("old", { state: "accepted" });
    const otherType = doc("q", { state: "accepted", typeCode: "guarantee_letter" });
    const otherParty = doc("x", { state: "accepted", subject: { kind: "party", partyId: "p2" } });
    const otherMaterial = doc("m", { state: "accepted", subject: { kind: "source", sourceId: "s9" } });
    const result = review(doc("new"), { others: [old, otherType, otherParty, otherMaterial] });
    expect(result.ok && result.superseded.map((d) => [d.id, d.state])).toEqual([["old", "superseded"]]);
    // Inputs are untouched.
    expect(old.state).toBe("accepted");
  });

  it("never replaces per-lot documents", () => {
    const source = { kind: "source", sourceId: "s1" } as const;
    const lot1 = doc("l1", { typeCode: "coa", subject: source, state: "accepted", lotCode: "A" });
    const result = review(doc("l2", { typeCode: "coa", subject: source, lotCode: "B" }), {
      others: [lot1],
      perLot: true,
    });
    expect(result.ok && result.superseded).toEqual([]);
  });
});

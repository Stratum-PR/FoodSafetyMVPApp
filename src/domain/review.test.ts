import { describe, expect, it } from "vitest";

import { checkCanReview, reviewDocument } from "./review";
import type { SupplierDocument } from "./suppliers";

const TODAY = "2026-09-24";
const qm = { userId: "ana", role: "quality_manager" } as const;
const party = { kind: "party", partyId: "p1" } as const;

function doc(id: string, extra: Partial<SupplierDocument> = {}): SupplierDocument {
  return {
    id,
    typeCode: "gfsi_cert",
    subject: party,
    state: "pending_review",
    receivedOn: "2026-09-01",
    uploadedBy: "luis",
    ...extra,
  };
}

describe("document review", () => {
  it("accepts a pending document and records who and when", () => {
    const result = reviewDocument(doc("d1"), [], qm, "accept", "", TODAY, false);
    expect(result).toMatchObject({
      ok: true,
      document: { state: "accepted", reviewedBy: "ana", reviewedOn: TODAY },
      superseded: [],
    });
  });

  it("never lets someone review their own upload", () => {
    const mine = doc("d1", { uploadedBy: "ana" });
    expect(reviewDocument(mine, [], qm, "accept", "", TODAY, false)).toEqual({ ok: false, denial: "own_upload" });
    expect(checkCanReview(qm, mine)).toBe("own_upload");
  });

  it("needs the review permission", () => {
    const warehouse = { userId: "w", role: "warehouse" } as const;
    expect(reviewDocument(doc("d1"), [], warehouse, "accept", "", TODAY, false)).toEqual({
      ok: false,
      denial: "no_permission",
    });
  });

  it("only decides documents that are waiting for review", () => {
    for (const state of ["accepted", "rejected", "superseded"] as const) {
      expect(reviewDocument(doc("d1", { state }), [], qm, "accept", "", TODAY, false)).toEqual({
        ok: false,
        denial: "not_pending",
      });
    }
  });

  it("requires a reason to reject, and keeps it trimmed", () => {
    expect(reviewDocument(doc("d1"), [], qm, "reject", "  no ", TODAY, false)).toEqual({
      ok: false,
      denial: "reason_required",
    });
    expect(reviewDocument(doc("d1"), [], qm, "reject", "x".repeat(501), TODAY, false)).toEqual({
      ok: false,
      denial: "reason_too_long",
    });
    const result = reviewDocument(doc("d1"), [], qm, "reject", "  Certificado vencido  ", TODAY, false);
    expect(result).toMatchObject({ ok: true, document: { state: "rejected", rejectionReason: "Certificado vencido" } });
  });

  it("replaces the older accepted document of the same type and subject", () => {
    const old = doc("old", { state: "accepted" });
    const otherType = doc("q", { state: "accepted", typeCode: "questionnaire" });
    const otherParty = doc("x", { state: "accepted", subject: { kind: "party", partyId: "p2" } });
    const result = reviewDocument(doc("new"), [old, otherType, otherParty], qm, "accept", "", TODAY, false);
    expect(result.ok && result.superseded.map((d) => [d.id, d.state])).toEqual([["old", "superseded"]]);
    // Inputs are untouched.
    expect(old.state).toBe("accepted");
  });

  it("never replaces per-lot documents", () => {
    const source = { kind: "source", sourceId: "s1" } as const;
    const lot1 = doc("l1", { typeCode: "coa", subject: source, state: "accepted", lotCode: "A" });
    const result = reviewDocument(
      doc("l2", { typeCode: "coa", subject: source, lotCode: "B" }),
      [lot1],
      qm,
      "accept",
      "",
      TODAY,
      true,
    );
    expect(result.ok && result.superseded).toEqual([]);
  });
});

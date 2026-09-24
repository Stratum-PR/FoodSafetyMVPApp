import { describe, expect, it } from "vitest";

import { reviewDocument } from "./review";
import type { SupplierDocument } from "./suppliers";
import { activeVersion, documentVersions } from "./versions";

const party = { kind: "party", partyId: "p1" } as const;

function doc(id: string, extra: Partial<SupplierDocument> = {}): SupplierDocument {
  return {
    id,
    typeCode: "gfsi_cert",
    subject: party,
    state: "accepted",
    receivedOn: "2026-01-10",
    uploadedBy: "luis",
    ...extra,
  };
}

describe("document versions", () => {
  const v2024 = doc("a", { state: "superseded", issuedOn: "2024-01-05" });
  const v2025 = doc("b", { state: "superseded", issuedOn: "2025-01-05" });
  const v2026 = doc("c", { issuedOn: "2026-01-05" });
  const otherType = doc("q", { typeCode: "questionnaire" });
  const otherParty = doc("x", { subject: { kind: "party", partyId: "p2" } });
  const all = [v2025, otherType, v2024, otherParty, v2026];

  it("lists every version of the same type and subject, newest first", () => {
    expect(documentVersions(v2024, all).map((d) => d.id)).toEqual(["c", "b", "a"]);
  });

  it("marks the accepted one as active", () => {
    expect(activeVersion(documentVersions(v2025, all))?.id).toBe("c");
    expect(activeVersion([v2024, v2025])).toBeUndefined();
  });

  it("keeps per-lot documents to their own lot", () => {
    const source = { kind: "source", sourceId: "s1" } as const;
    const lotA = doc("la", { typeCode: "coa", subject: source, lotCode: "A" });
    const lotB = doc("lb", { typeCode: "coa", subject: source, lotCode: "B" });
    expect(documentVersions(lotA, [lotA, lotB]).map((d) => d.id)).toEqual(["la"]);
  });

  it("keeps the old version on file after a new one is accepted", () => {
    const pending = doc("new", { state: "pending_review", issuedOn: "2027-01-05" });
    const qm = { userId: "ana", role: "quality_manager" } as const;
    const result = reviewDocument(pending, all, qm, "accept", "", "2027-01-20", false);
    if (!result.ok) throw new Error(result.denial);

    const changed = new Map([result.document, ...result.superseded].map((d) => [d.id, d]));
    const after = [...all, pending].map((d) => changed.get(d.id) ?? d);
    const history = documentVersions(result.document, after);
    expect(history.map((d) => [d.id, d.state])).toEqual([
      ["new", "accepted"],
      ["c", "superseded"],
      ["b", "superseded"],
      ["a", "superseded"],
    ]);
    expect(activeVersion(history)?.id).toBe("new");
  });
});

import { describe, expect, it } from "vitest";

import { checkPortalToken, portalExpiry } from "./portal";
import type { Requirement } from "./requirements";
import {
  batchStatus,
  checkNewRequest,
  type DocumentRequest,
  itemResolved,
  itemReviewed,
  itemUploaded,
  itemWaived,
  openRequirementKeys,
  type RequestItem,
  type RequestItemStatus,
  requestProgress,
} from "./requests";

const TODAY = "2026-09-24";
const AT = "2026-09-24T12:00:00.000Z";

function item(status: RequestItemStatus, key = `k-${status}`): RequestItem {
  return {
    id: `i-${key}`,
    requirementKey: key,
    subject: { kind: "party", partyId: "p1" },
    anyOf: ["questionnaire"],
    reason: "manufacturer",
    status,
    documentIds: status === "requested" ? [] : ["d1"],
    updatedAt: AT,
  };
}

function request(items: RequestItem[], extra: Partial<DocumentRequest> = {}): DocumentRequest {
  return {
    id: "r1",
    partyId: "p1",
    contactId: "c1",
    language: "es",
    dueOn: "2026-10-01",
    state: "sent",
    items,
    createdBy: "u",
    createdAt: AT,
    lastActivityAt: AT,
    ...extra,
  };
}

const status = (items: RequestItemStatus[], extra: Partial<DocumentRequest> = {}, today = TODAY) =>
  batchStatus(
    request(
      items.map((s, i) => item(s, `k${i}`)),
      extra,
    ),
    today,
  );

describe("request status precedence", () => {
  it("uses the stored state for drafts and cancelled requests", () => {
    expect(status(["accepted"], { state: "cancelled" })).toBe("cancelled");
    expect(status(["requested"], { state: "draft" })).toBe("draft");
  });

  it("is complete only when every item is accepted or waived", () => {
    expect(status(["accepted", "waived"])).toBe("complete");
    expect(status(["accepted", "uploaded"])).toBe("awaiting_review");
  });

  it("is overdue past the due date only while the supplier still owes something", () => {
    const late = "2026-10-02";
    expect(status(["requested", "accepted"], {}, late)).toBe("overdue");
    expect(status(["rejected", "uploaded"], {}, late)).toBe("overdue");
    // Everything sent and waiting on us: our delay, not theirs.
    expect(status(["uploaded", "resubmitted"], {}, late)).toBe("awaiting_review");
    // Due date itself is still on time.
    expect(status(["requested"], {}, "2026-10-01")).toBe("sent");
  });

  it("shows rejected items before waiting or partial states", () => {
    expect(status(["rejected", "uploaded", "requested"])).toBe("rejected_items");
    expect(status(["rejected", "accepted"])).toBe("rejected_items");
  });

  it("tells partial from nothing received", () => {
    expect(status(["requested", "requested"])).toBe("sent");
    expect(status(["requested", "uploaded"])).toBe("partially_received");
    expect(status(["requested", "accepted"])).toBe("partially_received");
    expect(status(["requested", "waived"])).toBe("partially_received");
  });

  it("counts requested, received and accepted items", () => {
    expect(requestProgress([item("requested"), item("uploaded"), item("accepted"), item("waived")])).toEqual({
      requested: 4,
      received: 3,
      accepted: 1,
      waived: 1,
    });
  });
});

describe("item transitions", () => {
  it("goes requested → uploaded → rejected → resubmitted → accepted, keeping every document", () => {
    const r = request([item("requested")]);
    const uploaded = itemUploaded(r, r.items[0], "d1", AT);
    if (typeof uploaded === "string") throw new Error(uploaded);
    expect(uploaded).toMatchObject({ status: "uploaded", documentIds: ["d1"] });

    // While one is under review, nothing more is taken for the item.
    expect(itemUploaded(r, uploaded, "dx", AT)).toBe("not_waiting");

    const rejected = itemReviewed(uploaded, "reject", "Falta la firma.", AT);
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Falta la firma." });

    const again = itemUploaded(r, rejected, "d2", AT);
    if (typeof again === "string") throw new Error(again);
    expect(again).toMatchObject({ status: "resubmitted", documentIds: ["d1", "d2"] });
    expect(itemReviewed(again, "accept", "", AT)).toMatchObject({ status: "accepted", rejectionReason: undefined });
  });

  it("refuses uploads to closed items, drafts and cancelled requests", () => {
    const r = request([item("accepted")]);
    expect(itemUploaded(r, r.items[0], "d", AT)).toBe("closed");
    expect(itemUploaded({ ...r, state: "cancelled" }, item("requested"), "d", AT)).toBe("cancelled");
    expect(itemUploaded({ ...r, state: "draft" }, item("requested"), "d", AT)).toBe("not_sent");
  });

  it("waives open items with a reason, and resolves them when the requirement is met another way", () => {
    expect(itemWaived(item("requested"), "Ya no se compra.", AT)).toMatchObject({
      status: "waived",
      waivedReason: "Ya no se compra.",
    });
    expect(itemWaived(item("accepted"), "x", AT)).toBe("closed");
    expect(itemResolved(item("rejected"), AT).status).toBe("accepted");
    expect(itemResolved(item("waived"), AT).status).toBe("waived");
  });
});

describe("new requests", () => {
  const gap = (key: string): Requirement => ({
    key,
    subject: { kind: "party", partyId: "p1" },
    anyOf: ["questionnaire"],
    reason: "manufacturer",
  });
  const context = { contactIds: ["c1"], gaps: [gap("a"), gap("b")], openKeys: new Set(["b"]), today: TODAY };
  const input = { contactId: "c1", requirementKeys: ["a"], dueOn: "2026-10-08", language: "en", message: " Hola " };

  it("builds items only from the supplier's real gaps", () => {
    expect(checkNewRequest(input, context)).toMatchObject({
      ok: true,
      requirements: [{ key: "a" }],
      language: "en",
      message: "Hola",
    });
    expect(checkNewRequest({ ...input, requirementKeys: ["made-up"] }, context)).toMatchObject({
      errors: { requirementKeys: "not_a_gap" },
    });
    expect(checkNewRequest({ ...input, requirementKeys: [] }, context)).toMatchObject({
      errors: { requirementKeys: "required" },
    });
  });

  it("doesn't ask twice for something already in an open request", () => {
    expect(checkNewRequest({ ...input, requirementKeys: ["a", "b"] }, context)).toMatchObject({
      errors: { requirementKeys: "already_requested" },
    });
    const open = openRequirementKeys([
      request([item("uploaded", "x"), item("accepted", "y")]),
      request([item("requested", "z")], { state: "cancelled" }),
    ]);
    expect([...open]).toEqual(["x"]);
  });

  it("checks the contact, due date and language", () => {
    expect(checkNewRequest({ ...input, contactId: "other", dueOn: TODAY, language: "fr" }, context)).toMatchObject({
      errors: { contactId: "required", dueOn: "date_too_soon", language: "required" },
    });
    expect(checkNewRequest({ ...input, dueOn: "2027-06-01" }, context)).toMatchObject({
      errors: { dueOn: "date_too_far" },
    });
  });
});

describe("request links", () => {
  const token = { expiresOn: portalExpiry(TODAY) };
  it("lasts 30 days, through its last day", () => {
    expect(token.expiresOn).toBe("2026-10-24");
    expect(checkPortalToken(token, { state: "sent" }, "2026-10-24")).toBeNull();
    expect(checkPortalToken(token, { state: "sent" }, "2026-10-25")).toBe("expired");
  });

  it("stops working when revoked or when the request is cancelled", () => {
    expect(checkPortalToken({ ...token, revokedAt: AT }, { state: "sent" }, TODAY)).toBe("revoked");
    expect(checkPortalToken(token, { state: "cancelled" }, TODAY)).toBe("cancelled");
    expect(checkPortalToken(token, { state: "draft" }, TODAY)).toBe("not_sent");
  });
});

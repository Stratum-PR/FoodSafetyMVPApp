import { describe, expect, it } from "vitest";

import { addDays } from "./dates";
import {
  expiryThreshold,
  nextRequestReminder,
  type PlannedMessage,
  planReminders,
  type ReminderInput,
} from "./reminders";
import type { DocumentRequest } from "./requests";
import type { Contact, SupplierDocument } from "./suppliers";

const TODAY = "2026-09-24"; // a Thursday
const contact: Contact = {
  id: "c1",
  partyId: "p1",
  name: "Calidad",
  email: "c@x.example",
  language: "es",
  role: "food_safety",
  isPrimary: true,
};

function accepted(id: string, extra: Partial<SupplierDocument> = {}): SupplierDocument {
  return {
    id,
    typeCode: "gfsi_cert",
    subject: { kind: "party", partyId: "p1" },
    state: "accepted",
    receivedOn: "2025-10-01",
    uploadedBy: "u",
    ...extra,
  };
}

function input(docs: [SupplierDocument, string | null][], extra: Partial<ReminderInput> = {}): ReminderInput {
  return {
    today: TODAY,
    documents: docs.map(([doc, expires]) => ({ doc, expires, partyId: "p1" })),
    requests: [],
    contacts: [contact],
    sent: new Set(),
    ...extra,
  };
}

const keys = (plan: PlannedMessage[]) => plan.map((m) => m.key);

/** Runs the scan day by day, remembering what was sent, like the daily job. */
function simulate(days: number, build: (today: string) => Omit<ReminderInput, "sent" | "today">): string[] {
  const sent = new Set<string>();
  const log: string[] = [];
  for (let i = 0; i < days; i++) {
    const today = addDays(TODAY, i);
    for (const m of planReminders({ ...build(today), today, sent })) {
      sent.add(m.key);
      log.push(`${today} ${m.key}`);
    }
  }
  return log;
}

describe("expiry reminders", () => {
  it("picks the closest threshold only", () => {
    expect(expiryThreshold(61)).toBeNull();
    expect(expiryThreshold(60)).toBe(60);
    expect(expiryThreshold(31)).toBe(60);
    expect(expiryThreshold(30)).toBe(30);
    expect(expiryThreshold(5)).toBe(7);
    expect(expiryThreshold(0)).toBe(7);
    expect(expiryThreshold(-1)).toBeNull();
  });

  it("sends 60, 30 and 7 days before, exactly once each, then escalates once when it expires", () => {
    const doc = accepted("d1");
    const log = simulate(70, () => input([[doc, addDays(TODAY, 62)]]));
    expect(log.filter((l) => !l.includes("digest"))).toEqual([
      "2026-09-26 expiry:d1:60",
      "2026-10-26 expiry:d1:30",
      "2026-11-18 expiry:d1:7",
      "2026-11-26 expired:d1",
    ]);
  });

  it("is idempotent: running twice the same day sends nothing new", () => {
    const first = planReminders(input([[accepted("d1"), addDays(TODAY, 5)]]));
    expect(keys(first)).toEqual(["expiry:d1:7"]);
    expect(planReminders(input([[accepted("d1"), addDays(TODAY, 5)]], { sent: new Set(keys(first)) }))).toEqual([]);
  });

  it("stops once a replacement is accepted (the old version is superseded)", () => {
    const old = accepted("old", { state: "superseded" });
    expect(planReminders(input([[old, addDays(TODAY, 5)]]))).toEqual([]);
  });

  it("pauses supplier warnings while their replacement waits for review", () => {
    const pending = accepted("new", { state: "pending_review" });
    expect(
      planReminders(
        input([
          [accepted("d1"), addDays(TODAY, 5)],
          [pending, null],
        ]),
      ),
    ).toEqual([]);
  });

  it("honors a contact's opt-out, but still escalates to the team", () => {
    const optedOut = { ...contact, remindersOptOut: true };
    expect(planReminders(input([[accepted("d1"), addDays(TODAY, 5)]], { contacts: [optedOut] }))).toEqual([]);
    expect(keys(planReminders(input([[accepted("d1"), addDays(TODAY, -1)]], { contacts: [optedOut] })))).toEqual([
      "expired:d1",
    ]);
  });
});

describe("request reminders", () => {
  const request = (extra: Partial<DocumentRequest> = {}): DocumentRequest => ({
    id: "r1",
    partyId: "p1",
    contactId: "c1",
    language: "es",
    dueOn: addDays(TODAY, 5),
    state: "sent",
    items: [
      {
        id: "i1",
        requirementKey: "k",
        subject: { kind: "party", partyId: "p1" },
        anyOf: ["questionnaire"],
        reason: "manufacturer",
        status: "requested",
        documentIds: [],
        updatedAt: "",
      },
    ],
    createdBy: "u",
    createdAt: "",
    lastActivityAt: "",
    ...extra,
  });

  it("reminds before the due date, once when overdue, and escalates after a week", () => {
    const log = simulate(20, () => input([], { requests: [request()] }));
    expect(log.filter((l) => !l.includes("digest"))).toEqual([
      "2026-09-26 due-soon:r1",
      "2026-09-30 overdue:r1",
      "2026-10-06 escalate:r1",
    ]);
  });

  it("says nothing once the supplier has sent everything, or for drafts", () => {
    const r = request();
    const waiting = { ...r, items: [{ ...r.items[0], status: "uploaded" as const, documentIds: ["d"] }] };
    expect(planReminders(input([], { requests: [waiting], today: addDays(TODAY, 10) }))).toEqual([]);
    expect(planReminders(input([], { requests: [request({ state: "draft" })], today: addDays(TODAY, 3) }))).toEqual([]);
  });

  it("shows the next reminder date", () => {
    expect(nextRequestReminder(request(), TODAY, new Set())).toEqual({ on: "2026-09-26", kind: "request_due_soon" });
    expect(nextRequestReminder(request(), TODAY, new Set(["due-soon:r1"]))).toEqual({
      on: "2026-09-30",
      kind: "request_overdue",
    });
    expect(nextRequestReminder(request({ state: "cancelled" }), TODAY, new Set())).toBeNull();
  });
});

describe("weekly digest", () => {
  it("goes out on Mondays only, once", () => {
    expect(keys(planReminders(input([], { today: "2026-09-28" })))).toEqual(["digest:2026-09-28"]);
    expect(planReminders(input([], { today: "2026-09-29" }))).toEqual([]);
  });
});

import { addDays, daysBetween, type IsoDate, weekday } from "./dates";
import { batchStatus, type DocumentRequest, isSupplierTurn } from "./requests";
import type { Contact, SupplierDocument } from "./suppliers";
import { sameRecord } from "./versions";

/*
 * The daily scan: what to send today. Pure, so it can be tested and re-run safely. Every message
 * has a key; a key already sent is never sent again, which makes the scan idempotent (one
 * message per item and threshold, even if the job runs twice or catches up after a gap).
 *
 * - Expiry warnings to the supplier's primary contact at 60, 30 and 7 days before an accepted
 *   document expires. Only the closest threshold is sent (a document found at 5 days gets the
 *   7-day warning, not three emails). They stop once a newer version is accepted (the old one
 *   is then superseded), and pause while the supplier's replacement waits for our review.
 * - When an accepted document expires, an in-app escalation to the team (once).
 * - Request reminders: 3 days before the due date, and once when it's overdue, while the
 *   supplier still owes items. Escalation to the team 7 days after the due date.
 * - Weekly digest for the team on Mondays.
 * Contacts who opted out of reminders get no reminder emails (requests themselves still go).
 */

export const EXPIRY_THRESHOLDS = [60, 30, 7] as const;
export type ExpiryThreshold = (typeof EXPIRY_THRESHOLDS)[number];
export const DUE_SOON_DAYS = 3;
export const ESCALATE_AFTER_DAYS = 7;
export const DIGEST_WEEKDAY = 1; // Monday

export type PlannedMessage =
  | {
      key: string;
      kind: "expiry_warning";
      threshold: ExpiryThreshold;
      documentId: string;
      partyId: string;
      contactId: string;
      expiresOn: IsoDate;
    }
  | { key: string; kind: "expired_escalation"; documentId: string; partyId: string; expiresOn: IsoDate }
  | { key: string; kind: "request_due_soon" | "request_overdue"; requestId: string; contactId: string; dueOn: IsoDate }
  | { key: string; kind: "request_escalation"; requestId: string; dueOn: IsoDate }
  | { key: string; kind: "weekly_digest"; week: IsoDate };

export type ReminderInput = {
  today: IsoDate;
  /** Every document, with its expiration and supplier. Only accepted ones are warned about. */
  documents: { doc: SupplierDocument; expires: IsoDate | null; partyId: string }[];
  requests: DocumentRequest[];
  contacts: Contact[];
  /** Keys already sent. */
  sent: ReadonlySet<string>;
};

/** The closest threshold reached, or null when the document is further out (or already expired). */
export function expiryThreshold(daysLeft: number): ExpiryThreshold | null {
  if (daysLeft < 0) return null;
  let hit: ExpiryThreshold | null = null;
  for (const t of EXPIRY_THRESHOLDS) if (daysLeft <= t) hit = t;
  return hit;
}

export function planReminders(input: ReminderInput): PlannedMessage[] {
  const { today, sent } = input;
  const plan: PlannedMessage[] = [];
  const add = (m: PlannedMessage) => {
    if (!sent.has(m.key) && !plan.some((p) => p.key === m.key)) plan.push(m);
  };
  const primary = (partyId: string) =>
    input.contacts.find((c) => c.partyId === partyId && c.isPrimary) ??
    input.contacts.find((c) => c.partyId === partyId);
  const pending = input.documents.filter((d) => d.doc.state === "pending_review").map((d) => d.doc);

  for (const { doc, expires, partyId } of input.documents) {
    if (doc.state !== "accepted" || expires === null) continue;
    const daysLeft = daysBetween(today, expires);
    if (daysLeft < 0) {
      add({ key: `expired:${doc.id}`, kind: "expired_escalation", documentId: doc.id, partyId, expiresOn: expires });
      continue;
    }
    const threshold = expiryThreshold(daysLeft);
    if (threshold === null) continue;
    // The supplier already sent the replacement: wait for our review instead of nagging them.
    if (pending.some((p) => sameRecord(p, doc))) continue;
    const contact = primary(partyId);
    if (!contact || contact.remindersOptOut) continue;
    add({
      key: `expiry:${doc.id}:${threshold}`,
      kind: "expiry_warning",
      threshold,
      documentId: doc.id,
      partyId,
      contactId: contact.id,
      expiresOn: expires,
    });
  }

  for (const request of input.requests) {
    if (request.state !== "sent" || !request.items.some(isSupplierTurn)) continue;
    const status = batchStatus(request, today);
    if (status === "complete" || status === "cancelled") continue;
    const contact = input.contacts.find((c) => c.id === request.contactId);
    const mayEmail = contact && !contact.remindersOptOut;
    const days = daysBetween(today, request.dueOn);
    const base = { requestId: request.id, dueOn: request.dueOn };
    if (mayEmail && days >= 0 && days <= DUE_SOON_DAYS) {
      add({ key: `due-soon:${request.id}`, kind: "request_due_soon", contactId: contact.id, ...base });
    }
    if (mayEmail && days < 0)
      add({ key: `overdue:${request.id}`, kind: "request_overdue", contactId: contact.id, ...base });
    if (today >= addDays(request.dueOn, ESCALATE_AFTER_DAYS)) {
      add({ key: `escalate:${request.id}`, kind: "request_escalation", ...base });
    }
  }

  if (weekday(today) === DIGEST_WEEKDAY) add({ key: `digest:${today}`, kind: "weekly_digest", week: today });
  return plan;
}

/** The next reminder a request will get, for the requests table. null when none is due. */
export function nextRequestReminder(
  request: DocumentRequest,
  today: IsoDate,
  sent: ReadonlySet<string>,
): { on: IsoDate; kind: "request_due_soon" | "request_overdue" | "request_escalation" } | null {
  if (request.state !== "sent" || !request.items.some(isSupplierTurn)) return null;
  const candidates = [
    { on: addDays(request.dueOn, -DUE_SOON_DAYS), kind: "request_due_soon" as const, key: `due-soon:${request.id}` },
    { on: addDays(request.dueOn, 1), kind: "request_overdue" as const, key: `overdue:${request.id}` },
    {
      on: addDays(request.dueOn, ESCALATE_AFTER_DAYS),
      kind: "request_escalation" as const,
      key: `escalate:${request.id}`,
    },
  ];
  const next = candidates.find((c) => !sent.has(c.key) && (c.on >= today || c.kind !== "request_due_soon"));
  if (!next) return null;
  return { on: next.on < today ? today : next.on, kind: next.kind };
}

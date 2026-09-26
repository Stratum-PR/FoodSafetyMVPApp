import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { Company } from "@/domain/company";
import type { IsoDate } from "@/domain/dates";
import type { AppNotification } from "@/domain/notifications";
import { summarizeObligations } from "@/domain/obligations";
import { type PlannedMessage, planReminders } from "@/domain/reminders";
import { batchStatus } from "@/domain/requests";
import { expirationOf } from "@/domain/status";

import { renderEmail } from "./email/templates";
import { describeSubject, emailContact, obligationsOf } from "./requests";
import { getSampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";
import { getWorkflowStore } from "./sample/workflow-store";

/*
 * The daily scan (expiry warnings, request reminders, escalations, weekly digest). In Azure it
 * runs as a pg-boss job from the Container Apps Job, once a day and on demand; on sample data
 * it runs the first time a company is opened each day. Either way it's idempotent: reminders.ts
 * never plans a key that was already sent.
 */

/** Runs the scan for a company unless it already ran today. Returns how many messages went out. */
export async function ensureDailyScan(company: Company, today: IsoDate): Promise<number> {
  const flow = getWorkflowStore(company.slug, today);
  if (flow.lastScanOn === today) return 0;
  flow.lastScanOn = today;
  return runDailyScan(company, today);
}

export async function runDailyScan(company: Company, today: IsoDate): Promise<number> {
  const store = getSampleStore(company.slug, today);
  const flow = getWorkflowStore(company.slug, today);
  const plan = planReminders({
    today,
    documents: store.documents.map((doc) => ({
      doc,
      expires: expirationOf(doc, findType(DEFAULT_CATALOG, doc.typeCode)),
      partyId: describeSubject(store, doc.subject).partyId,
    })),
    requests: flow.requests,
    contacts: store.contacts,
    sent: flow.sentReminders,
  });

  const team = SAMPLE_USERS.map((u) => u.id);
  const notify = (userIds: string[], n: Omit<AppNotification, "id" | "userId" | "createdAt">) => {
    const createdAt = new Date().toISOString();
    for (const userId of new Set(userIds)) flow.notifications.push({ id: randomUUID(), userId, createdAt, ...n });
  };

  for (const m of plan) {
    await deliver(m);
    flow.sentReminders.add(m.key);
  }
  return plan.length;

  async function deliver(m: PlannedMessage) {
    const partyName = (id: string) => store.parties.find((p) => p.id === id)?.name ?? "";
    switch (m.kind) {
      case "expiry_warning": {
        const contact = store.contacts.find((c) => c.id === m.contactId)!;
        const doc = store.documents.find((d) => d.id === m.documentId)!;
        const type = findType(DEFAULT_CATALOG, doc.typeCode)?.name[contact.language] ?? doc.typeCode;
        const content = await renderEmail("expiry_warning", contact.language, {
          company: company.name,
          party: partyName(m.partyId),
          document: type,
          expiresOn: m.expiresOn,
        });
        await emailContact(flow, contact, "expiry_warning", { kind: "document", id: m.documentId }, content);
        store.events.push(reminderEvent(m.partyId, { documentId: m.documentId, detail: m.key }));
        return;
      }
      case "request_due_soon":
      case "request_overdue": {
        const contact = store.contacts.find((c) => c.id === m.contactId)!;
        const request = flow.requests.find((r) => r.id === m.requestId)!;
        const content = await renderEmail(m.kind, contact.language, {
          company: company.name,
          party: partyName(request.partyId),
          count: request.items.filter((i) => i.status === "requested" || i.status === "rejected").length,
          dueOn: m.dueOn,
        });
        await emailContact(flow, contact, m.kind, { kind: "request", id: m.requestId }, content);
        store.events.push(reminderEvent(request.partyId, { requestId: m.requestId, detail: m.key }));
        return;
      }
      case "request_escalation": {
        const request = flow.requests.find((r) => r.id === m.requestId)!;
        notify([request.createdBy], { kind: "request_escalation", record: { kind: "request", id: m.requestId } });
        return;
      }
      case "expired_escalation":
        notify(team, { kind: "expired_escalation", record: { kind: "document", id: m.documentId } });
        return;
      case "weekly_digest": {
        const summary = summarizeObligations(obligationsOf(store, today));
        notify(team, {
          kind: "weekly_digest",
          record: null,
          data: {
            toReview: store.documents.filter((d) => d.state === "pending_review").length,
            gaps: summary.counts.missing + summary.counts.expired + summary.counts.rejected,
            expiring: summary.counts.expiring,
            overdue: flow.requests.filter((r) => batchStatus(r, today) === "overdue").length,
          },
        });
        return;
      }
    }
  }

  function reminderEvent(partyId: string, extra: { documentId?: string; requestId?: string; detail: string }) {
    return {
      id: randomUUID(),
      at: new Date().toISOString(),
      actorId: "system",
      action: "reminder.sent" as const,
      partyId,
      ...extra,
    };
  }
}

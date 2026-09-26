import "server-only";

import type { EmailLogEntry, NotificationKind, RecordRef } from "@/domain/notifications";

import { type RequestContext, requirePermission } from "./context";
import { getSampleStore } from "./sample/store";
import { getWorkflowStore } from "./sample/workflow-store";

/* The notification bell and the email log. Each person sees only their own notifications. */

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  record: RecordRef | null;
  createdAt: string;
  read: boolean;
  partyName?: string;
  data?: Record<string, number | string>;
};

export async function listNotifications(ctx: RequestContext): Promise<NotificationView[]> {
  const flow = getWorkflowStore(ctx.company.slug, ctx.today);
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const party = (id: unknown) => (typeof id === "string" ? store.parties.find((p) => p.id === id)?.name : undefined);
  return flow.notifications
    .filter((n) => n.userId === ctx.actor.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      record: n.record,
      createdAt: n.createdAt,
      read: Boolean(n.readAt),
      partyName: party(n.data?.partyId),
      data: n.data,
    }));
}

export async function markNotificationsRead(ctx: RequestContext): Promise<void> {
  const at = new Date().toISOString();
  for (const n of getWorkflowStore(ctx.company.slug, ctx.today).notifications) {
    if (n.userId === ctx.actor.userId && !n.readAt) n.readAt = at;
  }
}

export type EmailLogRow = EmailLogEntry & { contactName: string; partyName: string };

/** Every outbound email, newest first: the proof that suppliers were notified. */
export async function listEmailLog(ctx: RequestContext): Promise<EmailLogRow[]> {
  requirePermission(ctx, "requests.send");
  const flow = getWorkflowStore(ctx.company.slug, ctx.today);
  const store = getSampleStore(ctx.company.slug, ctx.today);
  return flow.emailLog
    .map((e) => {
      const contact = store.contacts.find((c) => c.id === e.contactId);
      return {
        ...e,
        contactName: contact?.name ?? "",
        partyName: store.parties.find((p) => p.id === contact?.partyId)?.name ?? "",
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

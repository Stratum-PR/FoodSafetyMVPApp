/*
 * In-app notifications (the bell) and the email log. The email log is the proof a supplier was
 * notified: every outbound email, with the provider's message id. While no email provider is
 * configured, messages are only logged ("logged") and never leave the app.
 */

export type NotificationKind = "portal_upload" | "expired_escalation" | "request_escalation" | "weekly_digest";

export type RecordRef = { kind: "document"; id: string } | { kind: "request"; id: string };

export type AppNotification = {
  id: string;
  /** Who sees it. */
  userId: string;
  kind: NotificationKind;
  record: RecordRef | null;
  /** ISO timestamp. */
  createdAt: string;
  readAt?: string;
  /** Small values for the message text (counts, names are looked up when shown). */
  data?: Record<string, number | string>;
};

export type EmailTemplate = "request" | "expiry_warning" | "request_due_soon" | "request_overdue";

/** logged: kept in the outbox only (no provider configured). sent: accepted by the provider. failed: the provider refused it. */
export type EmailStatus = "logged" | "sent" | "failed";

export type EmailLogEntry = {
  id: string;
  /** ISO timestamp. */
  at: string;
  toEmail: string;
  contactId: string;
  template: EmailTemplate;
  language: "es" | "en";
  record: RecordRef;
  /** The provider's message id ("outbox-…" for logged-only messages). */
  providerId: string;
  status: EmailStatus;
};

export function unreadCount(list: AppNotification[], userId: string): number {
  return list.filter((n) => n.userId === userId && !n.readAt).length;
}

import "server-only";

import { randomUUID } from "node:crypto";

import type { EmailStatus } from "@/domain/notifications";

/*
 * Outbound email. Production plugs in Azure Communication Services behind this interface
 * (docs/azure-setup.md); until then every message goes to the outbox: it's logged with an
 * "outbox-…" id and never leaves the app. So sample data, tests and fixtures can never email
 * a real address.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  /** Plain text. Both languages, the contact's first. */
  text: string;
};

export type SendResult = { providerId: string; status: EmailStatus };

export type EmailSender = { send(email: OutgoingEmail): Promise<SendResult> };

/** Keeps the message in the log only. */
export const outboxSender: EmailSender = {
  async send() {
    return { providerId: `outbox-${randomUUID()}`, status: "logged" };
  },
};

/** The configured sender. Only the outbox exists until the Communication Services adapter is built. */
export function emailSender(): EmailSender {
  return outboxSender;
}

import type { IsoDate } from "@/domain/dates";
import type { AppNotification, EmailLogEntry } from "@/domain/notifications";
import type { PortalToken } from "@/domain/portal";
import type { DocumentRequest } from "@/domain/requests";

/*
 * In-memory requests, request links, email log, notifications and the reminder keys already
 * sent, per company. Kept apart from the supplier sample store (store.ts) so the two can change
 * independently; both reset with the day, like the rest of the sample data. In Postgres these
 * are the plan's document_requests + request_items, portal_tokens, email_log and notifications
 * (and a reminders_sent table, or pg-boss singleton keys).
 */

export type WorkflowStore = {
  requests: DocumentRequest[];
  tokens: PortalToken[];
  emailLog: EmailLogEntry[];
  notifications: AppNotification[];
  /** PlannedMessage keys already sent by the daily scan (reminders.ts). */
  sentReminders: Set<string>;
  /** The last day the daily scan ran. */
  lastScanOn?: IsoDate;
};

const g = globalThis as unknown as { __stratumWorkflowStores?: Map<string, WorkflowStore> };
const stores = (g.__stratumWorkflowStores ??= new Map<string, WorkflowStore>());

export function getWorkflowStore(companySlug: string, today: IsoDate): WorkflowStore {
  const key = `${companySlug}|${today}`;
  let store = stores.get(key);
  if (!store) {
    for (const k of stores.keys()) if (k.startsWith(`${companySlug}|`)) stores.delete(k);
    store = { requests: [], tokens: [], emailLog: [], notifications: [], sentReminders: new Set() };
    stores.set(key, store);
  }
  return store;
}

/**
 * The token with this hash, in any company, with the company it belongs to. Only the request
 * link page uses this: the link is the only thing that identifies the company.
 */
export function findTokenByHash(tokenHash: string): { token: PortalToken; store: WorkflowStore } | null {
  for (const store of stores.values()) {
    const token = store.tokens.find((t) => t.tokenHash === tokenHash);
    if (token) return { token, store };
  }
  return null;
}

export function resetWorkflowStore(companySlug?: string): void {
  for (const k of [...stores.keys()]) if (!companySlug || k.startsWith(`${companySlug}|`)) stores.delete(k);
}

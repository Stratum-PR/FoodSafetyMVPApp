import { addDays, type IsoDate, isIsoDate } from "./dates";
import type { Requirement, RequirementReason } from "./requirements";
import type { RequirementResult } from "./status";
import type { DocumentSubject } from "./suppliers";

/*
 * Document requests: a batch of items asked of one supplier contact, each item one missing or
 * expired requirement. The requirement says what is needed and why; the request item says who
 * was asked and how it's going; the document says what arrived and what the reviewer decided.
 *
 * Item:   requested → uploaded → accepted
 *                             ↘ rejected → resubmitted → accepted / rejected …
 *         any open item → waived (closed on purpose, with a reason)
 * "Uploaded" and "resubmitted" items are waiting for our review; they never satisfy anything
 * until a reviewer accepts the document.
 */

export type RequestItemStatus = "requested" | "uploaded" | "resubmitted" | "accepted" | "rejected" | "waived";

export type RequestItem = {
  id: string;
  /** The requirement it asks for (Requirement.key). */
  requirementKey: string;
  subject: DocumentSubject;
  /** Any one of these document types satisfies it. */
  anyOf: readonly string[];
  /** Why it's needed. */
  reason: RequirementReason;
  status: RequestItemStatus;
  /** Every document sent for this item, oldest first. The last one is the one under review. */
  documentIds: string[];
  /** The latest rejection reason, shown to the supplier. */
  rejectionReason?: string;
  waivedReason?: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
};

/** Stored state. "draft" until sent; "cancelled" is final. Everything else is derived (batchStatus). */
export type RequestState = "draft" | "sent" | "cancelled";

export type DocumentRequest = {
  id: string;
  partyId: string;
  contactId: string;
  language: "es" | "en";
  dueOn: IsoDate;
  /** An optional note from the company, shown in the email and on the request page. */
  message?: string;
  state: RequestState;
  items: RequestItem[];
  createdBy: string;
  createdAt: string;
  sentBy?: string;
  sentAt?: string;
  cancelledReason?: string;
  /** ISO timestamp of the last thing that happened that we could observe (sent, opened, uploaded, reviewed). */
  lastActivityAt: string;
};

export type BatchStatus =
  "draft" | "sent" | "partially_received" | "awaiting_review" | "rejected_items" | "complete" | "overdue" | "cancelled";

const CLOSED: ReadonlySet<RequestItemStatus> = new Set(["accepted", "waived"]);
/** Items the supplier has to act on. */
const SUPPLIER_TURN: ReadonlySet<RequestItemStatus> = new Set(["requested", "rejected"]);
/** Items waiting for our review. */
const OUR_TURN: ReadonlySet<RequestItemStatus> = new Set(["uploaded", "resubmitted"]);

/**
 * One status for the whole request, by precedence (first match wins):
 * 1. cancelled, draft: stored states.
 * 2. complete: every item accepted or waived.
 * 3. overdue: past the due date and the supplier still owes something (requested or rejected items).
 *    Items waiting for our review don't make it overdue: that delay is ours.
 * 4. rejected_items: some item was rejected and not sent again.
 * 5. awaiting_review: nothing left for the supplier; something waits for our review.
 * 6. partially_received: some items arrived or were decided, others not yet.
 * 7. sent: nothing received yet.
 */
export function batchStatus(request: Pick<DocumentRequest, "state" | "items" | "dueOn">, today: IsoDate): BatchStatus {
  if (request.state === "cancelled") return "cancelled";
  if (request.state === "draft") return "draft";
  const items = request.items;
  if (items.every((i) => CLOSED.has(i.status))) return "complete";
  const supplierOwes = items.some((i) => SUPPLIER_TURN.has(i.status));
  if (supplierOwes && today > request.dueOn) return "overdue";
  if (items.some((i) => i.status === "rejected")) return "rejected_items";
  if (!supplierOwes) return "awaiting_review";
  return items.some((i) => i.status !== "requested") ? "partially_received" : "sent";
}

export type RequestProgress = { requested: number; received: number; accepted: number; waived: number };

/** Requested = all items; received = something arrived (under review or decided); accepted. */
export function requestProgress(items: RequestItem[]): RequestProgress {
  return {
    requested: items.length,
    received: items.filter((i) => i.documentIds.length > 0).length,
    accepted: items.filter((i) => i.status === "accepted").length,
    waived: items.filter((i) => i.status === "waived").length,
  };
}

/** Gaps that can be requested: missing or expired, plus expiring (to renew in time). */
export function requestableGaps(results: RequirementResult[]): RequirementResult[] {
  return results.filter((r) => r.status !== "current");
}

/* Creating a request */

export const DUE_MIN_DAYS = 1;
export const DUE_MAX_DAYS = 90;
export const DEFAULT_DUE_DAYS = 14;
export const MESSAGE_MAX = 1000;

export type NewRequestInput = {
  contactId: string;
  requirementKeys: string[];
  dueOn: string;
  language: string;
  message: string;
};

export type NewRequestField = "contactId" | "requirementKeys" | "dueOn" | "language" | "message";
export type NewRequestError =
  "required" | "not_a_gap" | "already_requested" | "invalid_date" | "date_too_soon" | "date_too_far" | "too_long";

export type NewRequestCheck =
  | { ok: true; requirements: Requirement[]; dueOn: IsoDate; language: "es" | "en"; message?: string }
  | { ok: false; errors: Partial<Record<NewRequestField, NewRequestError>> };

/**
 * Validates a new request for one supplier. Items must be the supplier's real gaps (never
 * made-up items), and not already asked for in another open request.
 */
export function checkNewRequest(
  input: NewRequestInput,
  context: {
    contactIds: string[];
    gaps: Requirement[];
    /** Requirement keys already in an open item of another request. */
    openKeys: ReadonlySet<string>;
    today: IsoDate;
  },
): NewRequestCheck {
  const errors: Partial<Record<NewRequestField, NewRequestError>> = {};
  if (!context.contactIds.includes(input.contactId)) errors.contactId = "required";

  const keys = [...new Set(input.requirementKeys)];
  const byKey = new Map(context.gaps.map((g) => [g.key, g]));
  if (!keys.length) errors.requirementKeys = "required";
  else if (keys.some((k) => !byKey.has(k))) errors.requirementKeys = "not_a_gap";
  else if (keys.some((k) => context.openKeys.has(k))) errors.requirementKeys = "already_requested";

  const dueOn = input.dueOn.trim();
  if (!dueOn) errors.dueOn = "required";
  else if (!isIsoDate(dueOn)) errors.dueOn = "invalid_date";
  else if (dueOn < addDays(context.today, DUE_MIN_DAYS)) errors.dueOn = "date_too_soon";
  else if (dueOn > addDays(context.today, DUE_MAX_DAYS)) errors.dueOn = "date_too_far";

  const language = input.language === "en" ? "en" : input.language === "es" ? "es" : null;
  if (!language) errors.language = "required";
  const message = input.message.trim();
  if (message.length > MESSAGE_MAX) errors.message = "too_long";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    requirements: keys.map((k) => byKey.get(k)!),
    dueOn,
    language: language!,
    message: message || undefined,
  };
}

/** Requirement keys already asked for in an open item of an active request. */
export function openRequirementKeys(requests: DocumentRequest[]): Set<string> {
  const keys = new Set<string>();
  for (const r of requests) {
    if (r.state === "cancelled") continue;
    for (const i of r.items) if (!CLOSED.has(i.status)) keys.add(i.requirementKey);
  }
  return keys;
}

/* Transitions. Each returns a new item and never changes its input. */

export type ItemDenial = "closed" | "not_waiting" | "cancelled" | "not_sent";

/** The supplier sent a document for an item: first time "uploaded", after a rejection "resubmitted". */
export function itemUploaded(
  request: DocumentRequest,
  item: RequestItem,
  documentId: string,
  at: string,
): RequestItem | ItemDenial {
  if (request.state === "cancelled") return "cancelled";
  if (request.state !== "sent") return "not_sent";
  // One document under review at a time; closed items take nothing more.
  if (!SUPPLIER_TURN.has(item.status)) return CLOSED.has(item.status) ? "closed" : "not_waiting";
  return {
    ...item,
    status: item.status === "rejected" ? "resubmitted" : "uploaded",
    documentIds: [...item.documentIds, documentId],
    updatedAt: at,
  };
}

/** The reviewer decided the item's document. A rejection goes back to the supplier with its reason. */
export function itemReviewed(
  item: RequestItem,
  decision: "accept" | "reject",
  reason: string,
  at: string,
): RequestItem {
  if (decision === "accept") return { ...item, status: "accepted", rejectionReason: undefined, updatedAt: at };
  return { ...item, status: "rejected", rejectionReason: reason, updatedAt: at };
}

/**
 * A requirement was satisfied another way (e.g. the team uploaded the document and it was
 * accepted): open items asking for it are closed as accepted, so reminders stop.
 */
export function itemResolved(item: RequestItem, at: string): RequestItem {
  return CLOSED.has(item.status) ? item : { ...item, status: "accepted", rejectionReason: undefined, updatedAt: at };
}

export function itemWaived(item: RequestItem, reason: string, at: string): RequestItem | ItemDenial {
  if (CLOSED.has(item.status)) return "closed";
  return { ...item, status: "waived", waivedReason: reason, updatedAt: at };
}

export function isItemOpen(item: RequestItem): boolean {
  return !CLOSED.has(item.status);
}

/** Items the supplier can upload for right now. */
export function isSupplierTurn(item: RequestItem): boolean {
  return SUPPLIER_TURN.has(item.status);
}

export function isOurTurn(item: RequestItem): boolean {
  return OUR_TURN.has(item.status);
}

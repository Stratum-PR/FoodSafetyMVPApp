/**
 * Something a person did, for the history (Historial) and later the hash-chained audit log.
 * Records only ids and codes; names are looked up when shown.
 */
export type ActivityAction =
  | "document.uploaded"
  | "document.accepted"
  | "document.rejected"
  | "supplier.created"
  | "supplier.status_changed"
  | "supplier.nonconformity_recorded"
  | "supplier.nonconformity_closed"
  | "supplier.risk_assessed"
  | "supplier.fsma204_assessed"
  | "source.qualification_changed"
  | "obligation.overridden"
  | "request.created"
  | "request.sent"
  | "request.link_created"
  | "request.cancelled"
  | "request.item_waived"
  | "portal.opened"
  | "portal.uploaded"
  | "reminder.sent";

export type ActivityEvent = {
  id: string;
  /** ISO timestamp (UTC). */
  at: string;
  /** A team member's id, "portal:<contact id>" for a supplier using a request link, or "system" for the daily job. */
  actorId: string;
  action: ActivityAction;
  /** For document actions. */
  documentId?: string;
  /** For request and portal actions. */
  requestId?: string;
  partyId: string;
  /** The rejection reason, how many older documents an acceptance replaced, or a waiver/cancel reason. */
  detail?: string;
};

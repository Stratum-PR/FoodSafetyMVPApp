/**
 * Something a person did, for the history (Historial) and later the hash-chained audit log.
 * Records only ids and codes; names are looked up when shown.
 */
export type ActivityAction =
  | "document.uploaded"
  | "document.accepted"
  | "document.rejected"
  | "supplier.status_changed"
  | "supplier.nonconformity_recorded"
  | "supplier.nonconformity_closed"
  | "supplier.risk_assessed"
  | "supplier.fsma204_assessed"
  | "source.qualification_changed"
  | "obligation.overridden";

export type ActivityEvent = {
  id: string;
  /** ISO timestamp (UTC). */
  at: string;
  actorId: string;
  action: ActivityAction;
  /** For document actions. */
  documentId?: string;
  partyId: string;
  /** The rejection reason, or how many older documents an acceptance replaced. */
  detail?: string;
};

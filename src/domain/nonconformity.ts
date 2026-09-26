import { type IsoDate, isIsoDate } from "./dates";

/*
 * A supplier nonconformity: something wrong with what a supplier delivered or did (a rejected
 * lot, a missing COA at receiving, a temperature excursion, a failed audit finding). It feeds
 * supplier performance and the three-in-twelve-months warning. It stays open until someone
 * closes it with a note. Full findings and CAPA (root cause, actions, verified closure) come
 * after the pilot and will start from these records.
 */

export const SEVERITIES = ["minor", "major", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Nonconformity = {
  id: string;
  partyId: string;
  /** When it happened (e.g. the receiving date). */
  date: IsoDate;
  severity: Severity;
  description: string;
  lotCode?: string;
  recordedBy: string;
  recordedOn: IsoDate;
  /** Open until closed. Older records without a status count as open. */
  status?: "open" | "closed";
  closedBy?: string;
  closedOn?: IsoDate;
  /** What was done about it. */
  closeNote?: string;
};

export function isOpen(nc: Pick<Nonconformity, "status">): boolean {
  return nc.status !== "closed";
}

export const CLOSE_NOTE_MIN = 5;

export type CloseError = "already_closed" | "required" | "too_short" | "too_long";

export function checkClose(nc: Pick<Nonconformity, "status">, note: string): CloseError | null {
  if (!isOpen(nc)) return "already_closed";
  const text = note.trim();
  if (!text) return "required";
  if (text.length < CLOSE_NOTE_MIN) return "too_short";
  if (text.length > DESCRIPTION_MAX) return "too_long";
  return null;
}

export type NonconformityInput = { date: string; severity: string; description: string; lotCode: string };
export type NonconformityField = "date" | "severity" | "description" | "lotCode";
export type NonconformityError = "required" | "invalid_date" | "future_date" | "too_short" | "too_long" | "invalid";

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 1000;
export const LOT_MAX = 40;

export type NonconformityCheck =
  | { ok: true; value: Pick<Nonconformity, "date" | "severity" | "description" | "lotCode"> }
  | { ok: false; errors: Partial<Record<NonconformityField, NonconformityError>> };

export function checkNonconformity(input: NonconformityInput, today: IsoDate): NonconformityCheck {
  const errors: Partial<Record<NonconformityField, NonconformityError>> = {};
  const date = input.date.trim();
  if (!date) errors.date = "required";
  else if (!isIsoDate(date)) errors.date = "invalid_date";
  else if (date > today) errors.date = "future_date";

  if (!input.severity) errors.severity = "required";
  else if (!(SEVERITIES as readonly string[]).includes(input.severity)) errors.severity = "invalid";

  const description = input.description.trim();
  if (!description) errors.description = "required";
  else if (description.length < DESCRIPTION_MIN) errors.description = "too_short";
  else if (description.length > DESCRIPTION_MAX) errors.description = "too_long";

  const lotCode = input.lotCode.trim();
  if (lotCode.length > LOT_MAX) errors.lotCode = "too_long";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { date, severity: input.severity as Severity, description, lotCode: lotCode || undefined },
  };
}

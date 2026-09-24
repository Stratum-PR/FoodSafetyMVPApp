import { type IsoDate, isIsoDate } from "./dates";

/*
 * A supplier nonconformity: something wrong with what a supplier delivered or did (a rejected
 * lot, a missing COA at receiving, a temperature excursion, a failed audit finding). It feeds
 * supplier performance and the three-in-twelve-months warning. Full CAPA comes after the MVP.
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
};

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

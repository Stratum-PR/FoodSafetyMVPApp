/**
 * Calendar dates as ISO strings (YYYY-MM-DD). Compliance dates are whole days in the
 * company's time zone, so there are no times or time zones here: callers pass "today".
 */
export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(date: IsoDate): Date {
  const m = ISO.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${date}`);
  return d;
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  try {
    toUtc(value);
    return true;
  } catch {
    return false;
  }
}

/** Adds calendar months. The day is clamped to the month's end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = toUtc(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Today's date in a time zone, e.g. America/Puerto_Rico. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

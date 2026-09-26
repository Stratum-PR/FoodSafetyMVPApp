import type { DocumentType } from "./catalog";
import { type IsoDate, isIsoDate } from "./dates";
import { REQUIREMENTS, type RequirementDef, type RequirementPolicy } from "./programs";
import { allRequirements, type Requirement, type SupplierData } from "./requirements";
import { evaluateRequirement, type RequirementResult } from "./status";
import { type ApprovedSource, involves, sameSubject, type Site, type SupplierDocument } from "./suppliers";

/*
 * Obligations: each requirement, on its subject, with a status. The document part of the status
 * (current / expiring / expired / missing) comes from status.ts, the one place that reads
 * documents; this layer only adds what documents alone can't say:
 *
 *   not_applicable  a person said it doesn't apply, with a reason (not counted at all)
 *   current         an accepted document, valid for more than 30 days
 *   expiring        an accepted document that expires within 30 days (still valid, still counted as met)
 *   waived          no valid document, but excused with a reason until an end date
 *   awaiting_review nothing valid yet, but a document is waiting for review: don't ask again
 *   expired         the accepted document is past its date
 *   rejected        the last document received was rejected, nothing valid
 *   missing         no accepted evidence at all (an obligation with nothing behind it, never a fake document)
 *
 * Requirements count (the denominator): every obligation that applies and isn't waived.
 * Met (the numerator): current + expiring. Waived ones are shown separately, never as met.
 */

export type ObligationStatus =
  "current" | "expiring" | "expired" | "missing" | "awaiting_review" | "rejected" | "waived" | "not_applicable";

export const OBLIGATION_STATUSES: ObligationStatus[] = [
  "missing",
  "expired",
  "rejected",
  "awaiting_review",
  "expiring",
  "waived",
  "current",
  "not_applicable",
];

/** A person's decision that an obligation doesn't apply, or is excused for a while. */
export type ObligationOverride = {
  id: string;
  /** The requirement key (subject + requirement code). */
  key: string;
  kind: "waived" | "not_applicable";
  reason: string;
  by: string;
  on: IsoDate;
  /** Waivers end; a not-applicable decision doesn't. */
  until?: IsoDate;
  /** Withdrawn overrides stay on record but no longer apply. */
  withdrawnOn?: IsoDate;
  /** The rule version it was decided under. */
  ruleVersion: string;
};

export type Obligation = Omit<RequirementResult, "status"> & {
  status: ObligationStatus;
  /** What the accepted documents alone say (status.ts). */
  documentStatus: RequirementResult["status"];
  /** A document waiting for review, if any. */
  pending?: SupplierDocument;
  /** The most recent rejected document, when nothing valid replaced it. */
  rejected?: SupplierDocument;
  /** The override in force. */
  override?: ObligationOverride;
};

/** The override in force for a key on `today`: not withdrawn, and a waiver not past its end date. */
export function activeOverride(
  overrides: ObligationOverride[],
  key: string,
  today: IsoDate,
): ObligationOverride | undefined {
  return overrides
    .filter((o) => o.key === key && !o.withdrawnOn && (o.kind === "not_applicable" || (o.until ?? "") >= today))
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))[0];
}

/** Adds review, rejection and override information to a requirement's document status. */
export function toObligation(
  result: RequirementResult,
  documents: SupplierDocument[],
  overrides: ObligationOverride[],
  today: IsoDate,
): Obligation {
  const { requirement } = result;
  const related = documents.filter(
    (d) => requirement.anyOf.includes(d.typeCode) && sameSubject(d.subject, requirement.subject) && !d.lotCode,
  );
  const pending = related.find((d) => d.state === "pending_review");
  const lastRejected = related
    .filter((d) => d.state === "rejected")
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))[0];
  const override = activeOverride(overrides, requirement.key, today);

  const base = { ...result, documentStatus: result.status, pending, override };
  if (override?.kind === "not_applicable") return { ...base, status: "not_applicable" };
  if (result.status === "current" || result.status === "expiring") return { ...base, status: result.status };
  if (override?.kind === "waived") return { ...base, status: "waived" };
  if (pending) return { ...base, status: "awaiting_review" };
  if (result.status === "expired") return { ...base, status: "expired" };
  // A rejection only matters if nothing was accepted after it.
  if (lastRejected) return { ...base, status: "rejected", rejected: lastRejected };
  return { ...base, status: "missing" };
}

export type ObligationInputs = {
  data: SupplierData;
  documents: SupplierDocument[];
  overrides: ObligationOverride[];
  catalog: DocumentType[];
  today: IsoDate;
  requirements?: RequirementDef[];
  policy?: RequirementPolicy;
};

/** Every obligation for every active source, once. The single status calculation for suppliers. */
export function evaluateObligations({
  data,
  documents,
  overrides,
  catalog,
  today,
  requirements = REQUIREMENTS,
  policy,
}: ObligationInputs): Obligation[] {
  return allRequirements(data, requirements, policy).map((r) =>
    toObligation(evaluateRequirement(r, documents, catalog, today), documents, overrides, today),
  );
}

/** The parties an obligation concerns: its subject's party, or both parties of a source. */
export function partiesOf(requirement: Requirement, sites: Site[], sources: ApprovedSource[]): string[] {
  const subject = requirement.subject;
  if (subject.kind === "party") return [subject.partyId];
  if (subject.kind === "site") {
    const site = sites.find((s) => s.id === subject.siteId);
    return site ? [site.partyId] : [];
  }
  const source = sources.find((s) => s.id === subject.sourceId);
  return source ? [source.manufacturerId, ...(source.distributorId ? [source.distributorId] : [])] : [];
}

/** Obligations grouped by party, in one pass (for the supplier list: no per-row queries). */
export function obligationsByParty(
  obligations: Obligation[],
  sites: Site[],
  sources: ApprovedSource[],
): Map<string, Obligation[]> {
  const siteParty = new Map(sites.map((s) => [s.id, s.partyId]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const map = new Map<string, Obligation[]>();
  const add = (partyId: string | undefined, o: Obligation) => {
    if (!partyId) return;
    const list = map.get(partyId);
    if (list) list.push(o);
    else map.set(partyId, [o]);
  };
  for (const o of obligations) {
    const subject = o.requirement.subject;
    if (subject.kind === "party") add(subject.partyId, o);
    else if (subject.kind === "site") add(siteParty.get(subject.siteId), o);
    else {
      const source = sourceById.get(subject.sourceId);
      add(source?.manufacturerId, o);
      if (source?.distributorId) add(source.distributorId, o);
    }
  }
  return map;
}

/** Obligations that concern one party (same result as obligationsByParty for that party). */
export function obligationsForParty(
  partyId: string,
  obligations: Obligation[],
  sites: Site[],
  sources: ApprovedSource[],
): Obligation[] {
  const siteIds = new Set(sites.filter((s) => s.partyId === partyId).map((s) => s.id));
  const sourceIds = new Set(sources.filter((s) => involves(s, partyId)).map((s) => s.id));
  return obligations.filter((o) => {
    const subject = o.requirement.subject;
    if (subject.kind === "party") return subject.partyId === partyId;
    if (subject.kind === "site") return siteIds.has(subject.siteId);
    return sourceIds.has(subject.sourceId);
  });
}

export type RequirementSummary = {
  /** Obligations that apply and aren't waived: the denominator. */
  applicable: number;
  /** current + expiring: the numerator. */
  met: number;
  counts: Record<ObligationStatus, number>;
  /** Unmet obligations that block a full approval. */
  blockingOpen: number;
  /** met / applicable, rounded down; null when nothing applies (never shown as 100%). */
  percent: number | null;
};

const UNMET: ObligationStatus[] = ["missing", "expired", "rejected", "awaiting_review"];

export function isUnmet(status: ObligationStatus): boolean {
  return UNMET.includes(status);
}

export function summarizeObligations(obligations: Obligation[]): RequirementSummary {
  const counts = Object.fromEntries(OBLIGATION_STATUSES.map((s) => [s, 0])) as Record<ObligationStatus, number>;
  let blockingOpen = 0;
  for (const o of obligations) {
    counts[o.status]++;
    if (o.requirement.blocking && isUnmet(o.status)) blockingOpen++;
  }
  const applicable = obligations.length - counts.not_applicable - counts.waived;
  const met = counts.current + counts.expiring;
  // Rounded down so 99.6% never shows as 100%.
  const percent = applicable === 0 ? null : Math.floor((met / applicable) * 100);
  return { applicable, met, counts, blockingOpen, percent };
}

/* Overrides: waive or mark not applicable. */

export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;
/** A waiver lasts at most a year: it's an exception, not a new rule. */
export const WAIVER_MAX_DAYS = 366;

export type OverrideField = "kind" | "reason" | "until";
export type OverrideError = "required" | "too_short" | "too_long" | "invalid_date" | "date_not_future" | "date_too_far";

export type OverrideInput = { kind: string; reason: string; until: string };

export function checkOverride(
  input: OverrideInput,
  today: IsoDate,
  maxUntil: IsoDate,
):
  | { ok: true; value: { kind: ObligationOverride["kind"]; reason: string; until?: IsoDate } }
  | { ok: false; errors: Partial<Record<OverrideField, OverrideError>> } {
  const errors: Partial<Record<OverrideField, OverrideError>> = {};
  const kind = input.kind === "waived" || input.kind === "not_applicable" ? input.kind : null;
  if (!kind) errors.kind = "required";
  const reason = input.reason.trim();
  if (!reason) errors.reason = "required";
  else if (reason.length < OVERRIDE_REASON_MIN) errors.reason = "too_short";
  else if (reason.length > OVERRIDE_REASON_MAX) errors.reason = "too_long";
  const until = input.until.trim();
  if (kind === "waived") {
    if (!until) errors.until = "required";
    else if (!isIsoDate(until)) errors.until = "invalid_date";
    else if (until <= today) errors.until = "date_not_future";
    else if (until > maxUntil) errors.until = "date_too_far";
  }
  if (Object.keys(errors).length || !kind) return { ok: false, errors };
  return { ok: true, value: { kind, reason, until: kind === "waived" ? until : undefined } };
}

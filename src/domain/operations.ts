import { NONCONFORMITY_WARNING_COUNT, NONCONFORMITY_WINDOW_MONTHS } from "./approval";
import { addDays, addMonths, daysBetween, type IsoDate } from "./dates";
import { type Nonconformity, type Severity, SEVERITIES } from "./nonconformity";
import type { RequirementResult } from "./status";
import type { ApprovedSource, Party, SupplierDocument } from "./suppliers";

/*
 * Operational rules for the panel: what someone has to act on today or this week.
 * (Trends and rates over time, the KPIs, come later and live apart from these.)
 */

/** Active = the company can buy from it: approved or conditionally approved, and not deactivated. */
export function isActiveSupplier(party: Pick<Party, "approval" | "lifecycle">): boolean {
  return (party.approval === "approved" || party.approval === "conditional") && party.lifecycle !== "inactive";
}

const unmet = (r: RequirementResult) => r.status === "expired" || r.status === "missing";

/* Expirations ------------------------------------------------------------------------ */

export type ExpiryOutlook = {
  expired: number;
  missing: number;
  /** Valid today, expiring in 0–30, 31–60 and 61–90 days. */
  within30: number;
  within60: number;
  within90: number;
};

/** Requirements by how soon their document stops being valid. */
export function expiryOutlook(results: RequirementResult[], today: IsoDate): ExpiryOutlook {
  const out: ExpiryOutlook = { expired: 0, missing: 0, within30: 0, within60: 0, within90: 0 };
  for (const r of results) {
    if (r.status === "expired") out.expired++;
    else if (r.status === "missing") out.missing++;
    else if (r.expiresOn) {
      const days = daysBetween(today, r.expiresOn);
      if (days <= 30) out.within30++;
      else if (days <= 60) out.within60++;
      else if (days <= 90) out.within90++;
    }
  }
  return out;
}

/* Review queue ----------------------------------------------------------------------- */

/** Documents waiting for review, and how many days the oldest has waited (null when none). */
export function reviewQueue(
  documents: Pick<SupplierDocument, "state" | "receivedOn">[],
  today: IsoDate,
): { count: number; oldestDays: number | null } {
  const waiting = documents.filter((d) => d.state === "pending_review");
  if (!waiting.length) return { count: 0, oldestDays: null };
  const oldest = waiting.reduce((min, d) => (d.receivedOn < min ? d.receivedOn : min), waiting[0].receivedOn);
  return { count: waiting.length, oldestDays: Math.max(0, daysBetween(oldest, today)) };
}

/* Conditional approvals -------------------------------------------------------------- */

/** Conditional approvals are flagged this many days before their review date. */
export const CONDITIONS_DUE_WINDOW_DAYS = 30;

export type ConditionsDue = { partyId: string; reviewBy: IsoDate; overdue: boolean };

/** Conditional approvals whose review date is past or within the window, most urgent first. */
export function conditionsDue(
  parties: Pick<Party, "id" | "approval" | "lifecycle" | "conditionsReviewBy">[],
  today: IsoDate,
): ConditionsDue[] {
  const limit = addDays(today, CONDITIONS_DUE_WINDOW_DAYS);
  return parties
    .filter((p) => p.approval === "conditional" && p.lifecycle !== "inactive" && p.conditionsReviewBy)
    .filter((p) => p.conditionsReviewBy! <= limit)
    .map((p) => ({ partyId: p.id, reviewBy: p.conditionsReviewBy!, overdue: p.conditionsReviewBy! < today }))
    .sort((a, b) => a.reviewBy.localeCompare(b.reviewBy));
}

/* Nonconformities -------------------------------------------------------------------- */

export type NonconformityOutlook = {
  /** Nonconformities in the last twelve months, by severity. */
  bySeverity: Record<Severity, number>;
  /** Suppliers that reached the review threshold (three in twelve months), most first. */
  repeat: { partyId: string; count: number }[];
};

export function nonconformityOutlook(
  nonconformities: Pick<Nonconformity, "partyId" | "date" | "severity">[],
  today: IsoDate,
): NonconformityOutlook {
  const since = addMonths(today, -NONCONFORMITY_WINDOW_MONTHS);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  const perParty = new Map<string, number>();
  for (const n of nonconformities) {
    // Same window as the approval warning.
    if (!(n.date > since && n.date <= today)) continue;
    bySeverity[n.severity]++;
    perParty.set(n.partyId, (perParty.get(n.partyId) ?? 0) + 1);
  }
  const repeat = [...perParty]
    .filter(([, count]) => count >= NONCONFORMITY_WARNING_COUNT)
    .map(([partyId, count]) => ({ partyId, count }))
    .sort((a, b) => b.count - a.count || a.partyId.localeCompare(b.partyId));
  return { bySeverity, repeat };
}

/* Risky sourcing --------------------------------------------------------------------- */

type SourceLinks = Pick<ApprovedSource, "id" | "status" | "manufacturerId" | "distributorId">;

/** Suspended suppliers that still make or sell an active material: it could still be received. */
export function suspendedWithActiveSources(
  parties: Pick<Party, "id" | "approval" | "lifecycle">[],
  sources: SourceLinks[],
): { partyId: string; activeSources: number }[] {
  return parties
    .filter((p) => p.approval === "suspended" || p.lifecycle === "suspended")
    .map((p) => ({
      partyId: p.id,
      activeSources: sources.filter(
        (s) => s.status === "active" && (s.manufacturerId === p.id || s.distributorId === p.id),
      ).length,
    }))
    .filter((x) => x.activeSources > 0);
}

/**
 * Active high-risk sources with an expired or missing requirement, on the source itself or
 * on its manufacturer or distributor. Most gaps first.
 */
export function highRiskGaps(
  sources: (SourceLinks & Pick<ApprovedSource, "materialId" | "risk">)[],
  results: RequirementResult[],
): { sourceId: string; materialId: string; manufacturerId: string; gaps: number }[] {
  return sources
    .filter((s) => s.status === "active" && s.risk === "high")
    .map((s) => {
      const gaps = results.filter((r) => {
        if (!unmet(r)) return false;
        const subject = r.requirement.subject;
        return subject.kind === "source"
          ? subject.sourceId === s.id
          : subject.partyId === s.manufacturerId || subject.partyId === s.distributorId;
      }).length;
      return { sourceId: s.id, materialId: s.materialId, manufacturerId: s.manufacturerId, gaps };
    })
    .filter((x) => x.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps || a.sourceId.localeCompare(b.sourceId));
}

/** Foreign manufacturers without a valid FSVP hazard analysis (21 CFR 1.504). */
export function fsvpGaps(results: RequirementResult[]): string[] {
  const ids = results
    .filter((r) => r.requirement.reason === "fsvp" && unmet(r) && r.requirement.subject.kind === "party")
    .map((r) => (r.requirement.subject as { partyId: string }).partyId);
  return [...new Set(ids)];
}

/* FDA registration renewal ----------------------------------------------------------- */

/**
 * Food facilities renew their FDA registration from October 1 to December 31 of every
 * even-numbered year (21 CFR 1.230). The period that is open now, or the next one.
 */
export function fdaRenewalPeriod(today: IsoDate): { opensOn: IsoDate; closesOn: IsoDate; open: boolean } {
  const current = Number(today.slice(0, 4));
  const year = current % 2 === 0 ? current : current + 1;
  const opensOn = `${year}-10-01`;
  const closesOn = `${year}-12-31`;
  return { opensOn, closesOn, open: today >= opensOn && today <= closesOn };
}

/**
 * Manufacturers that still have to show a renewed FDA registration for a period: none on
 * file, or the one on file is from before the period opened.
 */
export function fdaRenewalsDue(results: RequirementResult[], opensOn: IsoDate): string[] {
  const ids = results
    .filter((r) => r.requirement.anyOf.includes("fda_registration") && r.requirement.subject.kind === "party")
    .filter((r) => !r.document || (r.document.issuedOn ?? r.document.receivedOn) < opensOn || unmet(r))
    .map((r) => (r.requirement.subject as { partyId: string }).partyId);
  return [...new Set(ids)];
}

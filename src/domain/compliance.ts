import type { DocumentType } from "./catalog";
import type { IsoDate } from "./dates";
import { allRequirements, type SupplierData } from "./requirements";
import { evaluateRequirement, type RequirementResult, type RequirementStatus } from "./status";
import { involves, type SupplierDocument } from "./suppliers";

/*
 * Document-only view of the requirements (current / expiring / expired / missing). Screens use
 * obligations.ts, which adds review, rejection and waivers on top of this; this stays for the
 * few places that only care about accepted documents.
 */

export type ComplianceSummary = {
  total: number;
  counts: Record<RequirementStatus, number>;
  /** Share of requirements met (current or expiring), 0–100, rounded down. 100 when nothing is required. */
  percent: number;
};

export function summarize(results: RequirementResult[]): ComplianceSummary {
  const counts: Record<RequirementStatus, number> = { current: 0, expiring: 0, expired: 0, missing: 0 };
  for (const r of results) counts[r.status]++;
  const total = results.length;
  const met = counts.current + counts.expiring;
  // Rounded down so 99.6% never shows as 100%.
  const percent = total === 0 ? 100 : Math.floor((met / total) * 100);
  return { total, counts, percent };
}

/** Evaluates every requirement of the active sources. */
export function evaluateCompliance(
  data: SupplierData,
  documents: SupplierDocument[],
  catalog: DocumentType[],
  today: IsoDate,
): RequirementResult[] {
  return allRequirements(data).map((r) => evaluateRequirement(r, documents, catalog, today));
}

/** Results that concern one party: its own, its sites', and those of the sources it makes or sells. */
export function resultsForParty(
  partyId: string,
  results: RequirementResult[],
  data: Pick<SupplierData, "sites" | "sources">,
): RequirementResult[] {
  const siteIds = new Set(data.sites.filter((s) => s.partyId === partyId).map((s) => s.id));
  const sourceIds = new Set(data.sources.filter((s) => involves(s, partyId)).map((s) => s.id));
  return results.filter((r) => {
    const subject = r.requirement.subject;
    if (subject.kind === "party") return subject.partyId === partyId;
    if (subject.kind === "site") return siteIds.has(subject.siteId);
    return sourceIds.has(subject.sourceId);
  });
}

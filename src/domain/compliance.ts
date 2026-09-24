import type { DocumentType } from "./catalog";
import type { IsoDate } from "./dates";
import { allRequirements, type SupplierData } from "./requirements";
import { evaluateRequirement, type RequirementResult, type RequirementStatus } from "./status";
import type { SupplierDocument } from "./suppliers";

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

/** Evaluates every requirement of the active approved sources. */
export function evaluateCompliance(
  data: SupplierData,
  documents: SupplierDocument[],
  catalog: DocumentType[],
  today: IsoDate,
): RequirementResult[] {
  return allRequirements(data).map((r) => evaluateRequirement(r, documents, catalog, today));
}

/** Results that concern one party: its own documents plus those of the sources it makes or sells. */
export function resultsForParty(
  partyId: string,
  results: RequirementResult[],
  sources: SupplierData["sources"],
): RequirementResult[] {
  const sourceIds = new Set(
    sources.filter((s) => s.manufacturerId === partyId || s.distributorId === partyId).map((s) => s.id),
  );
  return results.filter((r) =>
    r.requirement.subject.kind === "party"
      ? r.requirement.subject.partyId === partyId
      : sourceIds.has(r.requirement.subject.sourceId),
  );
}

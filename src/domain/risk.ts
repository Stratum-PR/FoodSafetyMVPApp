import { addMonths, type IsoDate, isIsoDate } from "./dates";
import type { Risk } from "./suppliers";

/*
 * Supplier risk: a person's assessment, never computed on its own. The assessor rates each
 * factor, the company's policy suggests an overall rating, and the assessor decides the rating
 * and writes why. Each assessment is a new version; the policy version it used is kept with
 * it, so changing the policy later never rewrites an earlier assessment.
 * Material (ingredient) risk is separate: it's on each source (ApprovedSource.risk).
 */

export const RISK_FACTORS = ["material_hazard", "origin", "certification", "history", "allergens"] as const;
export type RiskFactor = (typeof RISK_FACTORS)[number];
export const RISK_LEVELS: Risk[] = ["low", "medium", "high"];

export type RiskPolicy = {
  version: string;
  /** Any factor rated high suggests high. */
  highIfAnyHigh: boolean;
  /** This many medium (or higher) factors suggest at least medium. */
  mediumFrom: number;
};

export const DEFAULT_RISK_POLICY: RiskPolicy = { version: "2026-09-26", highIfAnyHigh: true, mediumFrom: 2 };

export type RiskAssessment = {
  id: string;
  partyId: string;
  /** 1, 2, 3… per supplier. */
  version: number;
  factors: Record<RiskFactor, Risk>;
  /** What the policy suggested, kept for the record. */
  suggested: Risk;
  /** The assessor's decision. */
  rating: Risk;
  rationale: string;
  policyVersion: string;
  assessedBy: string;
  assessedOn: IsoDate;
  /** When it should be assessed again. */
  nextReviewOn: IsoDate;
};

const RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

export function suggestRating(factors: Record<RiskFactor, Risk>, policy: RiskPolicy): Risk {
  const levels = RISK_FACTORS.map((f) => factors[f]);
  if (policy.highIfAnyHigh && levels.includes("high")) return "high";
  if (levels.filter((l) => RANK[l] >= RANK.medium).length >= policy.mediumFrom) return "medium";
  return levels.includes("high") ? "medium" : "low";
}

/** The current assessment: the latest version. undefined = not assessed. */
export function currentAssessment(assessments: RiskAssessment[], partyId: string): RiskAssessment | undefined {
  return assessments.filter((a) => a.partyId === partyId).sort((a, b) => b.version - a.version)[0];
}

/** Starting values for the form, from what the records say. Hints only: the assessor decides. */
export function factorHints(facts: {
  materialRisks: Risk[];
  foreign: boolean;
  certification: "verified" | "pending" | "none";
  openIssues: number;
  recentIssues: number;
  allergenMaterials: number;
}): Record<RiskFactor, Risk> {
  const worst = facts.materialRisks.reduce<Risk>((w, r) => (RANK[r] > RANK[w] ? r : w), "low");
  return {
    material_hazard: worst,
    origin: facts.foreign ? "medium" : "low",
    certification: facts.certification === "verified" ? "low" : facts.certification === "pending" ? "medium" : "high",
    history: facts.recentIssues >= 3 ? "high" : facts.recentIssues > 0 || facts.openIssues > 0 ? "medium" : "low",
    allergens: facts.allergenMaterials > 0 ? "medium" : "low",
  };
}

export const RATIONALE_MIN = 10;
export const RATIONALE_MAX = 1000;
export const RISK_REVIEW_MAX_MONTHS = 36;

export type RiskField = RiskFactor | "rating" | "rationale" | "nextReviewOn";
export type RiskError =
  "required" | "invalid" | "too_short" | "too_long" | "invalid_date" | "date_not_future" | "date_too_far";

export type RiskInput = Record<RiskFactor, string> & { rating: string; rationale: string; nextReviewOn: string };

export function checkRiskAssessment(
  input: RiskInput,
  policy: RiskPolicy,
  today: IsoDate,
):
  | {
      ok: true;
      value: Pick<RiskAssessment, "factors" | "suggested" | "rating" | "rationale" | "policyVersion" | "nextReviewOn">;
    }
  | { ok: false; errors: Partial<Record<RiskField, RiskError>> } {
  const errors: Partial<Record<RiskField, RiskError>> = {};
  const isLevel = (v: string): v is Risk => (RISK_LEVELS as string[]).includes(v);
  const factors = {} as Record<RiskFactor, Risk>;
  for (const f of RISK_FACTORS) {
    const v = input[f];
    if (!v) errors[f] = "required";
    else if (!isLevel(v)) errors[f] = "invalid";
    else factors[f] = v;
  }
  if (!input.rating) errors.rating = "required";
  else if (!isLevel(input.rating)) errors.rating = "invalid";
  const rationale = input.rationale.trim();
  if (!rationale) errors.rationale = "required";
  else if (rationale.length < RATIONALE_MIN) errors.rationale = "too_short";
  else if (rationale.length > RATIONALE_MAX) errors.rationale = "too_long";
  const next = input.nextReviewOn.trim();
  if (!next) errors.nextReviewOn = "required";
  else if (!isIsoDate(next)) errors.nextReviewOn = "invalid_date";
  else if (next <= today) errors.nextReviewOn = "date_not_future";
  else if (next > addMonths(today, RISK_REVIEW_MAX_MONTHS)) errors.nextReviewOn = "date_too_far";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      factors,
      suggested: suggestRating(factors, policy),
      rating: input.rating as Risk,
      rationale,
      policyVersion: policy.version,
      nextReviewOn: next,
    },
  };
}

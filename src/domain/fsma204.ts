import type { IsoDate } from "./dates";
import type { Material } from "./suppliers";

/*
 * FSMA 204 (21 CFR 1 subpart S, food traceability): whether the rule applies to what this
 * supplier sends, decided by a person with a written reason. Until someone decides, it's
 * "not assessed": never assumed to apply or not to apply. This records applicability only;
 * lot-level traceability (CTEs and KDEs) comes in a later phase, so there's no readiness score.
 */

export type Fsma204Decision = "applicable" | "not_applicable" | "exempt";
export type Fsma204Status = Fsma204Decision | "not_assessed";

export type Fsma204Assessment = {
  id: string;
  partyId: string;
  version: number;
  decision: Fsma204Decision;
  rationale: string;
  /** For exempt: the exemption relied on (e.g. "21 CFR 1.1305(d): receives a kill step"). */
  exemption?: string;
  assessedBy: string;
  assessedOn: IsoDate;
};

export function currentFsma204(assessments: Fsma204Assessment[], partyId: string): Fsma204Assessment | undefined {
  return assessments.filter((a) => a.partyId === partyId).sort((a, b) => b.version - a.version)[0];
}

/** What the material records say, as a hint for the assessor (never the decision). */
export type Fsma204Hint = "ftl_materials" | "no_ftl_materials" | "materials_not_checked";

export function fsma204Hint(activeMaterials: Pick<Material, "onFtl">[]): Fsma204Hint {
  if (activeMaterials.some((m) => m.onFtl === true)) return "ftl_materials";
  if (activeMaterials.length && activeMaterials.every((m) => m.onFtl === false)) return "no_ftl_materials";
  return "materials_not_checked";
}

export const FSMA_TEXT_MIN = 10;
export const FSMA_TEXT_MAX = 1000;

export type Fsma204Field = "decision" | "rationale" | "exemption";
export type Fsma204Error = "required" | "invalid" | "too_short" | "too_long";

export function checkFsma204(input: {
  decision: string;
  rationale: string;
  exemption: string;
}):
  | { ok: true; value: Pick<Fsma204Assessment, "decision" | "rationale" | "exemption"> }
  | { ok: false; errors: Partial<Record<Fsma204Field, Fsma204Error>> } {
  const errors: Partial<Record<Fsma204Field, Fsma204Error>> = {};
  const decisions: string[] = ["applicable", "not_applicable", "exempt"];
  if (!input.decision) errors.decision = "required";
  else if (!decisions.includes(input.decision)) errors.decision = "invalid";
  const text = (v: string, field: Fsma204Field, required: boolean) => {
    const t = v.trim();
    if (!t) {
      if (required) errors[field] = "required";
    } else if (t.length < FSMA_TEXT_MIN) errors[field] = "too_short";
    else if (t.length > FSMA_TEXT_MAX) errors[field] = "too_long";
    return t;
  };
  const rationale = text(input.rationale, "rationale", true);
  // The exemption only matters (and is only checked) when the decision is "exempt".
  const exemption = input.decision === "exempt" ? text(input.exemption, "exemption", true) : undefined;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      decision: input.decision as Fsma204Decision,
      rationale,
      exemption,
    },
  };
}

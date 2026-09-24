import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { type ComplianceSummary, evaluateCompliance, resultsForParty, summarize } from "@/domain/compliance";
import type { IsoDate } from "@/domain/dates";
import { expirationOf, type RequirementResult } from "@/domain/status";
import { type ApprovedSource, isForeign, type Material, type Party, type SupplierDocument } from "@/domain/suppliers";

import type { SampleSupplierData, SampleUser } from "./sample/suppliers";

/*
 * Everything the supplier page shows, assembled from the supplier data. Kept free of
 * server-only imports so it can be tested directly against the sample data.
 */

export type PartyRef = { id: string; name: string };

export type SourceView = {
  id: string;
  material: Material;
  /** What this supplier does for the material. */
  role: "manufacturer" | "distributor";
  /** manufacturer role: who distributes it (null = bought direct). distributor role: who makes it. */
  counterpart: PartyRef | null;
  status: ApprovedSource["status"];
  risk: ApprovedSource["risk"];
  /** Material-level requirements (spec sheet, allergen statement…). Empty when the source isn't active. */
  requirements: RequirementResult[];
};

export type DocumentView = SupplierDocument & {
  /** Material name for material-level documents; null for the supplier's own documents. */
  materialName: string | null;
  expires: IsoDate | null;
  uploadedByName: string;
};

export type SupplierDetail = {
  party: Party;
  foreign: boolean;
  createdByName: string;
  compliance: ComplianceSummary;
  /** Requirements on the supplier itself (certificates, questionnaire, FSVP…). */
  partyRequirements: RequirementResult[];
  sources: SourceView[];
  /** Every document received, newest first, including those waiting for review and per-lot COAs. */
  documents: DocumentView[];
};

const SOURCE_STATUS_ORDER = { active: 0, inactive: 1, rejected: 2 } as const;

export function buildSupplierDetail(
  data: SampleSupplierData,
  partyId: string,
  today: IsoDate,
  users: SampleUser[],
): SupplierDetail | null {
  const party = data.parties.find((p) => p.id === partyId);
  if (!party) return null;

  const parties = new Map(data.parties.map((p) => [p.id, p]));
  const materials = new Map(data.materials.map((m) => [m.id, m]));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const ref = (id: string | null): PartyRef | null => {
    const p = id ? parties.get(id) : undefined;
    return p ? { id: p.id, name: p.name } : null;
  };

  const results = evaluateCompliance(data, data.documents, DEFAULT_CATALOG, today);
  const mine = resultsForParty(party.id, results, data.sources);
  const related = data.sources.filter((s) => s.manufacturerId === party.id || s.distributorId === party.id);
  const relatedIds = new Set(related.map((s) => s.id));

  const sources: SourceView[] = related
    .map((s) => {
      const role = s.manufacturerId === party.id ? "manufacturer" : "distributor";
      return {
        id: s.id,
        material: materials.get(s.materialId)!,
        role,
        counterpart: role === "manufacturer" ? ref(s.distributorId) : ref(s.manufacturerId),
        status: s.status,
        risk: s.risk,
        requirements: mine.filter(
          (r) => r.requirement.subject.kind === "source" && r.requirement.subject.sourceId === s.id,
        ),
      } satisfies SourceView;
    })
    .sort(
      (a, b) =>
        SOURCE_STATUS_ORDER[a.status] - SOURCE_STATUS_ORDER[b.status] ||
        a.material.name.localeCompare(b.material.name, "es"),
    );

  const sourceMaterial = new Map(related.map((s) => [s.id, materials.get(s.materialId)?.name ?? ""]));
  const documents: DocumentView[] = data.documents
    .filter((d) => (d.subject.kind === "party" ? d.subject.partyId === party.id : relatedIds.has(d.subject.sourceId)))
    .map((d) => ({
      ...d,
      materialName: d.subject.kind === "source" ? (sourceMaterial.get(d.subject.sourceId) ?? null) : null,
      expires: expirationOf(d, findType(DEFAULT_CATALOG, d.typeCode)),
      uploadedByName: userName(d.uploadedBy),
    }))
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || a.id.localeCompare(b.id));

  return {
    party,
    foreign: isForeign(party),
    createdByName: userName(party.createdBy),
    compliance: summarize(mine),
    partyRequirements: mine.filter((r) => r.requirement.subject.kind === "party"),
    sources,
    documents,
  };
}

import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { SiteCertification } from "@/domain/certifications";
import type { IsoDate } from "@/domain/dates";
import { currentFsma204, type Fsma204Assessment, fsma204Hint, type Fsma204Hint } from "@/domain/fsma204";
import { type Obligation, type ObligationOverride, obligationsForParty } from "@/domain/obligations";
import type { RequirementPolicy } from "@/domain/programs";
import { currentAssessment, type RiskAssessment } from "@/domain/risk";
import { expirationOf } from "@/domain/status";
import { summarizeSuppliers, type SupplierDataset, type SupplierSummary } from "@/domain/supplier-summary";
import {
  type ApprovedSource,
  type Contact,
  involves,
  isForeign,
  type Material,
  type Party,
  type Site,
  type SupplierDocument,
} from "@/domain/suppliers";

import type { SampleUser } from "./sample/suppliers";

/*
 * Everything the supplier page shows, assembled from the supplier data. Kept free of
 * server-only imports so it can be tested directly against the sample data. Counts come
 * from summarizeSuppliers, the same function the supplier list uses.
 */

export type PartyRef = { id: string; name: string };

export type SourceView = {
  id: string;
  material: Material;
  /** What this supplier does for the material. */
  role: "manufacturer" | "distributor";
  /** manufacturer role: who distributes it (null = bought direct). distributor role: who makes it. */
  counterpart: PartyRef | null;
  /** The manufacturer's site it comes from. */
  site: Site | undefined;
  commercial: ApprovedSource["commercial"];
  qualification: ApprovedSource["qualification"] & { decidedByName?: string };
  risk: ApprovedSource["risk"];
  coaPolicy: ApprovedSource["coaPolicy"];
  specification?: string;
  /** Material-level obligations (spec sheet, allergen statement…). Empty when it isn't bought. */
  requirements: Obligation[];
};

export type SiteView = Site & {
  certification: SiteCertification;
  /** Facility obligations (certification, FDA registration). */
  obligations: Obligation[];
};

export type DocumentView = SupplierDocument & {
  /** Material name for material-level documents; null otherwise. */
  materialName: string | null;
  /** Site label for facility documents; null otherwise. */
  siteName: string | null;
  expires: IsoDate | null;
  uploadedByName: string;
};

type Named<T, K extends string> = T & Record<K, string>;

export type SupplierDetail = {
  party: Party;
  foreign: boolean;
  createdByName: string;
  summary: SupplierSummary;
  contacts: Contact[];
  sites: SiteView[];
  /** Every obligation that concerns this supplier, worst first. */
  obligations: Obligation[];
  sources: SourceView[];
  /** Every document received, newest first, including those waiting for review and per-lot COAs. */
  documents: DocumentView[];
  risk: { current?: Named<RiskAssessment, "assessedByName">; history: Named<RiskAssessment, "assessedByName">[] };
  fsma204: {
    current?: Named<Fsma204Assessment, "assessedByName">;
    history: Named<Fsma204Assessment, "assessedByName">[];
    hint: Fsma204Hint;
  };
  overrides: Named<ObligationOverride, "byName">[];
  /** Labels for "applies because": source id → material name, site id → site label. */
  labels: { sources: Record<string, string>; sites: Record<string, string | null> };
};

const SOURCE_ORDER = { active: 0, inactive: 1 } as const;
const STATUS_ORDER: Record<Obligation["status"], number> = {
  missing: 0,
  expired: 1,
  rejected: 2,
  awaiting_review: 3,
  expiring: 4,
  waived: 5,
  current: 6,
  not_applicable: 7,
};
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 } as const;

export function buildSupplierDetail(
  data: SupplierDataset,
  partyId: string,
  today: IsoDate,
  users: SampleUser[],
  policy?: RequirementPolicy,
): SupplierDetail | null {
  const party = data.parties.find((p) => p.id === partyId);
  if (!party) return null;

  const parties = new Map(data.parties.map((p) => [p.id, p]));
  const materials = new Map(data.materials.map((m) => [m.id, m]));
  const sitesById = new Map(data.sites.map((s) => [s.id, s]));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const ref = (id: string | null): PartyRef | null => {
    const p = id ? parties.get(id) : undefined;
    return p ? { id: p.id, name: p.name } : null;
  };

  const { summaries, obligations: all } = summarizeSuppliers(data, { catalog: DEFAULT_CATALOG, today, policy });
  const summary = summaries.get(party.id)!;
  const mine = obligationsForParty(party.id, all, data.sites, data.sources).sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEVERITY_ORDER[a.requirement.severity] - SEVERITY_ORDER[b.requirement.severity] ||
      a.requirement.key.localeCompare(b.requirement.key),
  );
  const related = data.sources.filter((s) => involves(s, party.id));
  const relatedIds = new Set(related.map((s) => s.id));
  const ownSites = data.sites.filter((s) => s.partyId === party.id);
  const ownSiteIds = new Set(ownSites.map((s) => s.id));

  const sources: SourceView[] = related
    .map((s) => {
      const role = s.manufacturerId === party.id ? "manufacturer" : "distributor";
      return {
        id: s.id,
        material: materials.get(s.materialId)!,
        role,
        counterpart: role === "manufacturer" ? ref(s.distributorId) : ref(s.manufacturerId),
        site: sitesById.get(s.siteId),
        commercial: s.commercial,
        qualification: {
          ...s.qualification,
          decidedByName: s.qualification.decidedBy ? userName(s.qualification.decidedBy) : undefined,
        },
        risk: s.risk,
        coaPolicy: s.coaPolicy,
        specification: s.specification,
        requirements: mine.filter(
          (o) => o.requirement.subject.kind === "source" && o.requirement.subject.sourceId === s.id,
        ),
      } satisfies SourceView;
    })
    .sort(
      (a, b) =>
        SOURCE_ORDER[a.commercial] - SOURCE_ORDER[b.commercial] || a.material.name.localeCompare(b.material.name, "es"),
    );

  const sites: SiteView[] = ownSites.map((site) => ({
    ...site,
    certification: summary.sites.find((c) => c.siteId === site.id)!,
    obligations: mine.filter((o) => o.requirement.subject.kind === "site" && o.requirement.subject.siteId === site.id),
  }));

  const sourceMaterial = new Map(related.map((s) => [s.id, materials.get(s.materialId)?.name ?? ""]));
  const siteLabel = (id: string) => {
    const s = sitesById.get(id);
    return s ? (s.name ?? null) : null;
  };
  const documents: DocumentView[] = data.documents
    .filter((d) =>
      d.subject.kind === "party"
        ? d.subject.partyId === party.id
        : d.subject.kind === "site"
          ? ownSiteIds.has(d.subject.siteId)
          : relatedIds.has(d.subject.sourceId),
    )
    .map((d) => ({
      ...d,
      materialName: d.subject.kind === "source" ? (sourceMaterial.get(d.subject.sourceId) ?? null) : null,
      siteName:
        d.subject.kind === "site"
          ? (siteLabel(d.subject.siteId) ?? sitesById.get(d.subject.siteId)?.city ?? null)
          : null,
      expires: expirationOf(d, findType(DEFAULT_CATALOG, d.typeCode)),
      uploadedByName: userName(d.uploadedBy),
    }))
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || a.id.localeCompare(b.id));

  const riskHistory = data.riskAssessments
    .filter((a) => a.partyId === party.id)
    .sort((a, b) => b.version - a.version)
    .map((a) => ({ ...a, assessedByName: userName(a.assessedBy) }));
  const currentRisk = currentAssessment(data.riskAssessments, party.id);
  const fsmaHistory = data.fsma204
    .filter((a) => a.partyId === party.id)
    .sort((a, b) => b.version - a.version)
    .map((a) => ({ ...a, assessedByName: userName(a.assessedBy) }));
  const currentFsma = currentFsma204(data.fsma204, party.id);
  const keys = new Set(mine.map((o) => o.requirement.key));

  const labels = { sources: {} as Record<string, string>, sites: {} as Record<string, string | null> };
  for (const o of mine) {
    for (const id of o.requirement.sourceIds) {
      const s = data.sources.find((x) => x.id === id);
      if (s) labels.sources[id] = materials.get(s.materialId)?.name ?? id;
    }
    if (o.requirement.subject.kind === "site")
      labels.sites[o.requirement.subject.siteId] = siteLabel(o.requirement.subject.siteId);
  }

  return {
    party,
    foreign: isForeign(party),
    createdByName: userName(party.createdBy),
    summary,
    contacts: data.contacts
      .filter((c) => c.partyId === party.id)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    sites,
    obligations: mine,
    sources,
    documents,
    risk: {
      current: currentRisk ? riskHistory.find((a) => a.id === currentRisk.id) : undefined,
      history: riskHistory,
    },
    fsma204: {
      current: currentFsma ? fsmaHistory.find((a) => a.id === currentFsma.id) : undefined,
      history: fsmaHistory,
      hint: fsma204Hint(related.filter((s) => s.commercial === "active").map((s) => materials.get(s.materialId) ?? {})),
    },
    overrides: data.overrides
      .filter((o) => keys.has(o.key))
      .sort((a, b) => b.on.localeCompare(a.on))
      .map((o) => ({ ...o, byName: userName(o.by) })),
    labels,
  };
}

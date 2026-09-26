import { type ApprovalRecord, type ApprovalState, approvalState } from "./approval";
import type { DocumentType } from "./catalog";
import {
  type CertificationSummary,
  type SiteCertification,
  siteCertification,
  summarizeCertification,
} from "./certifications";
import type { IsoDate } from "./dates";
import { currentFsma204, type Fsma204Assessment, fsma204Hint, type Fsma204Status } from "./fsma204";
import { isOpen, type Nonconformity } from "./nonconformity";
import {
  evaluateObligations,
  type Obligation,
  type ObligationOverride,
  obligationsByParty,
  type RequirementSummary,
  summarizeObligations,
} from "./obligations";
import type { RequirementDef, RequirementPolicy } from "./programs";
import type { SupplierData } from "./requirements";
import { currentAssessment, type RiskAssessment } from "./risk";
import { type Contact, involves, type Risk, type SupplierDocument } from "./suppliers";

/*
 * One supplier's standing, the same everywhere it's shown: the supplier list, the supplier
 * page and (later) the Passport all call summarizeSuppliers, which evaluates every obligation
 * once and groups by party. Nothing here is typed by hand or cached: it's all derived.
 */

export type SupplierDataset = SupplierData & {
  contacts: Contact[];
  documents: SupplierDocument[];
  approvals: ApprovalRecord[];
  nonconformities: Nonconformity[];
  riskAssessments: RiskAssessment[];
  fsma204: Fsma204Assessment[];
  overrides: ObligationOverride[];
};

export type SummaryOptions = {
  catalog: DocumentType[];
  today: IsoDate;
  requirements?: RequirementDef[];
  policy?: RequirementPolicy;
};

/** The one thing to do next for a supplier, with where to do it. */
export type NextAction =
  | { kind: "conditions_overdue"; since: IsoDate }
  | { kind: "review_overdue"; since: IsoDate }
  | { kind: "blocking_gap"; key: string; count: number }
  | { kind: "review_document"; documentId: string; count: number }
  | { kind: "open_issue"; nonconformityId: string; count: number }
  | { kind: "gap"; key: string; count: number }
  | { kind: "decide_approval" }
  | { kind: "assess_risk" }
  | { kind: "assess_fsma204" }
  | { kind: "expiring"; key: string; count: number };

export type SupplierSummary = {
  partyId: string;
  state: ApprovalState;
  /** Date of the last approval decision, if any. */
  decidedOn?: IsoDate;
  /** When the approval or its conditions must be reviewed. */
  reviewBy?: IsoDate;
  risk: { rating: Risk | null; assessedOn?: IsoDate; version?: number };
  materials: {
    /** Sources bought today (commercially active). Buying is not a safety approval. */
    active: number;
    /** Of the active ones, qualified (approved or conditional). */
    qualified: number;
    /** Of the active ones, never assessed. */
    notAssessed: number;
    total: number;
  };
  certification: CertificationSummary;
  sites: SiteCertification[];
  requirements: RequirementSummary;
  fsma204: { status: Fsma204Status; assessedOn?: IsoDate };
  issues: { open: number; serious: number };
  nextAction: NextAction | null;
};

const GAP_ORDER = ["expired", "rejected", "missing"] as const;
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 } as const;

function worstFirst(a: Obligation, b: Obligation): number {
  return (
    SEVERITY_ORDER[a.requirement.severity] - SEVERITY_ORDER[b.requirement.severity] ||
    a.requirement.key.localeCompare(b.requirement.key)
  );
}

export function nextActionFor(input: {
  state: ApprovalState;
  reviewBy?: IsoDate;
  obligations: Obligation[];
  pendingDocuments: SupplierDocument[];
  openIssues: Nonconformity[];
  riskAssessed: boolean;
  fsma204: Fsma204Status;
  hasFtlMaterials: boolean;
  today: IsoDate;
}): NextAction | null {
  const { state, obligations, today } = input;
  if (state === "inactive" || state === "rejected") return null;

  if (input.reviewBy && input.reviewBy < today) {
    if (state === "conditional") return { kind: "conditions_overdue", since: input.reviewBy };
    if (state === "approved") return { kind: "review_overdue", since: input.reviewBy };
  }
  const blocking = obligations
    .filter((o) => o.requirement.blocking && ["missing", "expired", "rejected"].includes(o.status))
    .sort(worstFirst);
  if (blocking.length) return { kind: "blocking_gap", key: blocking[0].requirement.key, count: blocking.length };

  if (input.pendingDocuments.length) {
    const oldest = [...input.pendingDocuments].sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))[0];
    return { kind: "review_document", documentId: oldest.id, count: input.pendingDocuments.length };
  }
  const serious = input.openIssues.filter((n) => n.severity !== "minor").sort((a, b) => b.date.localeCompare(a.date));
  if (serious.length) return { kind: "open_issue", nonconformityId: serious[0].id, count: serious.length };

  const gaps = obligations
    .filter((o) => (GAP_ORDER as readonly string[]).includes(o.status))
    .sort(
      (a, b) =>
        GAP_ORDER.indexOf(a.status as (typeof GAP_ORDER)[number]) -
          GAP_ORDER.indexOf(b.status as (typeof GAP_ORDER)[number]) || worstFirst(a, b),
    );
  if (gaps.length) return { kind: "gap", key: gaps[0].requirement.key, count: gaps.length };

  if (state === "pending" || state === "under_verification") return { kind: "decide_approval" };
  if (!input.riskAssessed) return { kind: "assess_risk" };
  if (input.fsma204 === "not_assessed" && input.hasFtlMaterials) return { kind: "assess_fsma204" };

  const expiring = obligations.filter((o) => o.status === "expiring").sort(worstFirst);
  if (expiring.length) return { kind: "expiring", key: expiring[0].requirement.key, count: expiring.length };
  return null;
}

export type SupplierSummaries = {
  summaries: Map<string, SupplierSummary>;
  obligations: Obligation[];
  byParty: Map<string, Obligation[]>;
};

/** Every supplier's summary in one pass: obligations are evaluated once for the whole company. */
export function summarizeSuppliers(ds: SupplierDataset, options: SummaryOptions): SupplierSummaries {
  const { catalog, today } = options;
  const obligations = evaluateObligations({
    data: ds,
    documents: ds.documents,
    overrides: ds.overrides,
    catalog,
    today,
    requirements: options.requirements,
    policy: options.policy,
  });
  const byParty = obligationsByParty(obligations, ds.sites, ds.sources);
  const materials = new Map(ds.materials.map((m) => [m.id, m]));
  const siteParty = new Map(ds.sites.map((s) => [s.id, s.partyId]));
  const sourceById = new Map(ds.sources.map((s) => [s.id, s]));

  // Pending documents by party, in one pass.
  const pendingByParty = new Map<string, SupplierDocument[]>();
  for (const d of ds.documents) {
    if (d.state !== "pending_review") continue;
    const s = d.subject;
    const owners =
      s.kind === "party"
        ? [s.partyId]
        : s.kind === "site"
          ? [siteParty.get(s.siteId)]
          : [sourceById.get(s.sourceId)?.manufacturerId, sourceById.get(s.sourceId)?.distributorId];
    for (const id of new Set(owners)) {
      if (!id) continue;
      const list = pendingByParty.get(id) ?? [];
      list.push(d);
      pendingByParty.set(id, list);
    }
  }

  const summaries = new Map<string, SupplierSummary>();
  for (const party of ds.parties) {
    const mine = byParty.get(party.id) ?? [];
    const sources = ds.sources.filter((s) => involves(s, party.id));
    const active = sources.filter((s) => s.commercial === "active");
    const activeMaterials = active.map((s) => materials.get(s.materialId)).filter((m) => m !== undefined);
    const sites = ds.sites
      .filter((s) => s.partyId === party.id)
      .map((site) => siteCertification(site, ds.documents, mine, catalog, today));
    const risk = currentAssessment(ds.riskAssessments, party.id);
    const fsma = currentFsma204(ds.fsma204, party.id);
    const openIssues = ds.nonconformities.filter((n) => n.partyId === party.id && isOpen(n));
    const lastDecision = ds.approvals.filter((a) => a.partyId === party.id).sort((a, b) => b.on.localeCompare(a.on))[0];
    const state = approvalState(party);
    const fsmaStatus: Fsma204Status = fsma?.decision ?? "not_assessed";

    summaries.set(party.id, {
      partyId: party.id,
      state,
      decidedOn: lastDecision?.on,
      reviewBy: party.terms?.reviewBy,
      risk: { rating: risk?.rating ?? null, assessedOn: risk?.assessedOn, version: risk?.version },
      materials: {
        active: active.length,
        qualified: active.filter((s) => ["approved", "conditional"].includes(s.qualification.status)).length,
        notAssessed: active.filter((s) => s.qualification.status === "not_assessed").length,
        total: sources.length,
      },
      certification: summarizeCertification(sites),
      sites,
      requirements: summarizeObligations(mine),
      fsma204: { status: fsmaStatus, assessedOn: fsma?.assessedOn },
      issues: { open: openIssues.length, serious: openIssues.filter((n) => n.severity !== "minor").length },
      nextAction: nextActionFor({
        state,
        reviewBy: party.terms?.reviewBy,
        obligations: mine,
        pendingDocuments: pendingByParty.get(party.id) ?? [],
        openIssues,
        riskAssessed: Boolean(risk),
        fsma204: fsmaStatus,
        hasFtlMaterials: fsma204Hint(activeMaterials) === "ftl_materials",
        today,
      }),
    });
  }
  return { summaries, obligations, byParty };
}

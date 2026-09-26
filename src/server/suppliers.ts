import "server-only";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { type ComplianceSummary, evaluateCompliance, resultsForParty, summarize } from "@/domain/compliance";
import type { RequirementResult } from "@/domain/status";
import type { Approval, Lifecycle, PartyType } from "@/domain/suppliers";
import { isForeign } from "@/domain/suppliers";
import {
  conditionsDue,
  expiryOutlook,
  type ExpiryOutlook,
  fdaRenewalPeriod,
  fdaRenewalsDue,
  fsvpGaps,
  highRiskGaps,
  isActiveSupplier,
  nonconformityOutlook,
  reviewQueue,
  suspendedWithActiveSources,
} from "@/domain/operations";
import type { Severity } from "@/domain/nonconformity";

import { type RequestContext, requirePermission } from "./context";
import { getSampleStore } from "./sample/store";
import { SAMPLE_USERS, type SampleSupplierData } from "./sample/suppliers";
import { buildSupplierDetail, type SupplierDetail } from "./supplier-detail";

/*
 * Supplier service. Today it reads the fictional sample data; later it queries Postgres
 * under the company's row-level security. Screens only see these functions.
 */

function loadData(ctx: RequestContext): SampleSupplierData {
  return getSampleStore(ctx.company.slug, ctx.today);
}

function evaluate(ctx: RequestContext, data: SampleSupplierData): RequirementResult[] {
  return evaluateCompliance(data, data.documents, DEFAULT_CATALOG, ctx.today);
}

export type SupplierRow = {
  id: string;
  name: string;
  type: PartyType;
  city: string;
  country: string;
  foreign: boolean;
  lifecycle: Lifecycle;
  approval: Approval;
  /** Active approved sources this party makes or sells. */
  activeSources: number;
  compliance: ComplianceSummary;
};

/** Every supplier with its compliance, worst first. */
export async function listSuppliers(ctx: RequestContext): Promise<SupplierRow[]> {
  requirePermission(ctx, "suppliers.view");
  const data = loadData(ctx);
  const results = evaluate(ctx, data);

  return data.parties
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      city: p.city,
      country: p.country,
      foreign: isForeign(p),
      lifecycle: p.lifecycle,
      approval: p.approval,
      activeSources: data.sources.filter(
        (s) => s.status === "active" && (s.manufacturerId === p.id || s.distributorId === p.id),
      ).length,
      compliance: summarize(resultsForParty(p.id, results, data.sources)),
    }))
    .sort((a, b) => a.compliance.percent - b.compliance.percent || a.name.localeCompare(b.name, "es"));
}

export type Attention = {
  partyId: string;
  partyName: string;
  typeCode: string;
  status: "expiring" | "expired";
  expiresOn: string;
};

/** A supplier named on a panel card, with a short detail (a date, a count…). */
export type NamedParty = { partyId: string; partyName: string };

export type PanelOperations = {
  expiry: ExpiryOutlook;
  reviewQueue: { count: number; oldestDays: number | null };
  conditionsDue: (NamedParty & { reviewBy: string; overdue: boolean })[];
  nonconformities: { bySeverity: Record<Severity, number>; repeat: (NamedParty & { count: number })[] };
  suspendedActive: (NamedParty & { activeSources: number })[];
  highRisk: (NamedParty & { sourceId: string; materialName: string; gaps: number })[];
  fsvp: NamedParty[];
  fdaRenewal: { opensOn: string; closesOn: string; open: boolean; due: NamedParty[] };
};

export type PanelSummary = {
  compliance: ComplianceSummary;
  /** active: approved or conditional, and not deactivated. */
  suppliers: { active: number; pendingApproval: number; conditional: number };
  documentsToReview: number;
  /** Expired and soon-to-expire documents, most urgent first. */
  attention: Attention[];
  operations: PanelOperations;
};

export async function getPanelSummary(ctx: RequestContext): Promise<PanelSummary> {
  requirePermission(ctx, "suppliers.view");
  const data = loadData(ctx);
  const results = evaluate(ctx, data);
  const names = new Map(data.parties.map((p) => [p.id, p.name]));
  const sourceMaker = new Map(data.sources.map((s) => [s.id, s.manufacturerId]));

  const attention: Attention[] = results
    .filter((r) => (r.status === "expiring" || r.status === "expired") && r.document && r.expiresOn)
    .map((r) => {
      const subject = r.requirement.subject;
      const partyId = subject.kind === "party" ? subject.partyId : (sourceMaker.get(subject.sourceId) ?? "");
      return {
        partyId,
        partyName: names.get(partyId) ?? "",
        typeCode: r.document!.typeCode,
        status: r.status as Attention["status"],
        expiresOn: r.expiresOn!,
      };
    })
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));

  const named = <T extends { partyId: string }>(list: T[]): (T & NamedParty)[] =>
    list.map((x) => ({ ...x, partyName: names.get(x.partyId) ?? "" }));
  const materialNames = new Map(data.materials.map((m) => [m.id, m.name]));
  const ncs = nonconformityOutlook(data.nonconformities ?? [], ctx.today);
  const fda = fdaRenewalPeriod(ctx.today);
  const queue = reviewQueue(data.documents, ctx.today);

  return {
    compliance: summarize(results),
    suppliers: {
      active: data.parties.filter(isActiveSupplier).length,
      pendingApproval: data.parties.filter((p) => p.approval === "pending").length,
      conditional: data.parties.filter((p) => p.approval === "conditional").length,
    },
    documentsToReview: queue.count,
    attention,
    operations: {
      expiry: expiryOutlook(results, ctx.today),
      reviewQueue: queue,
      conditionsDue: named(conditionsDue(data.parties, ctx.today)),
      nonconformities: { bySeverity: ncs.bySeverity, repeat: named(ncs.repeat) },
      suspendedActive: named(suspendedWithActiveSources(data.parties, data.sources)),
      highRisk: highRiskGaps(data.sources, results).map((x) => ({
        partyId: x.manufacturerId,
        partyName: names.get(x.manufacturerId) ?? "",
        sourceId: x.sourceId,
        materialName: materialNames.get(x.materialId) ?? "",
        gaps: x.gaps,
      })),
      fsvp: named(fsvpGaps(results).map((partyId) => ({ partyId }))),
      fdaRenewal: { ...fda, due: named(fdaRenewalsDue(results, fda.opensOn).map((partyId) => ({ partyId }))) },
    },
  };
}

/** One supplier with its requirements, materials and documents, or null if it doesn't exist. */
export async function getSupplier(ctx: RequestContext, partyId: string): Promise<SupplierDetail | null> {
  requirePermission(ctx, "suppliers.view");
  return buildSupplierDetail(loadData(ctx), partyId, ctx.today, SAMPLE_USERS);
}

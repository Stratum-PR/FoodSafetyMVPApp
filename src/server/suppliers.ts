import "server-only";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { type ComplianceSummary, evaluateCompliance, resultsForParty, summarize } from "@/domain/compliance";
import type { RequirementResult } from "@/domain/status";
import type { Approval, Lifecycle, PartyType } from "@/domain/suppliers";
import { isForeign } from "@/domain/suppliers";

import { type RequestContext, requirePermission } from "./context";
import { generateSampleSuppliers, SAMPLE_USERS, type SampleSupplierData } from "./sample/suppliers";
import { buildSupplierDetail, type SupplierDetail } from "./supplier-detail";

/*
 * Supplier service. Today it reads the fictional sample data; later it queries Postgres
 * under the company's row-level security. Screens only see these functions.
 */

const cacheByKey = new Map<string, SampleSupplierData>();

function loadData(ctx: RequestContext): SampleSupplierData {
  const key = `${ctx.company.slug}|${ctx.today}`;
  let data = cacheByKey.get(key);
  if (!data) {
    if (cacheByKey.size > 20) cacheByKey.clear();
    data = generateSampleSuppliers(ctx.company.slug, ctx.today);
    cacheByKey.set(key, data);
  }
  return data;
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

export type PanelSummary = {
  compliance: ComplianceSummary;
  suppliers: { total: number; pendingApproval: number; conditional: number };
  documentsToReview: number;
  /** Expired and soon-to-expire documents, most urgent first. */
  attention: Attention[];
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

  return {
    compliance: summarize(results),
    suppliers: {
      total: data.parties.filter((p) => p.lifecycle !== "inactive").length,
      pendingApproval: data.parties.filter((p) => p.approval === "pending").length,
      conditional: data.parties.filter((p) => p.approval === "conditional").length,
    },
    documentsToReview: data.documents.filter((d) => d.state === "pending_review").length,
    attention,
  };
}

/** One supplier with its requirements, materials and documents, or null if it doesn't exist. */
export async function getSupplier(ctx: RequestContext, partyId: string): Promise<SupplierDetail | null> {
  requirePermission(ctx, "suppliers.view");
  return buildSupplierDetail(loadData(ctx), partyId, ctx.today, SAMPLE_USERS);
}

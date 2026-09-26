import "server-only";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { summarizeObligations, type RequirementSummary } from "@/domain/obligations";
import { summarizeSuppliers, type SupplierSummary } from "@/domain/supplier-summary";
import type { PartyType } from "@/domain/suppliers";
import { isForeign } from "@/domain/suppliers";

import { type RequestContext, requirePermission } from "./context";
import { getSampleStore, type SampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";
import { buildSupplierDetail, type SupplierDetail } from "./supplier-detail";

/*
 * Supplier service. Today it reads the fictional sample data; later it queries Postgres
 * under the company's row-level security. Screens only see these functions. The list, the
 * supplier page and the panel all count with summarizeSuppliers, so their numbers agree.
 */

function loadData(ctx: RequestContext): SampleStore {
  return getSampleStore(ctx.company.slug, ctx.today);
}

function summarize(ctx: RequestContext, data: SampleStore) {
  return summarizeSuppliers(data, { catalog: DEFAULT_CATALOG, today: ctx.today, policy: data.requirementPolicy });
}

export type SupplierRow = {
  id: string;
  name: string;
  type: PartyType;
  city: string;
  country: string;
  foreign: boolean;
  summary: SupplierSummary;
};

/** Every supplier with its summary, computed in one pass for the whole company. */
export async function listSuppliers(ctx: RequestContext): Promise<SupplierRow[]> {
  requirePermission(ctx, "suppliers.view");
  const data = loadData(ctx);
  const { summaries } = summarize(ctx, data);
  return data.parties.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    city: p.city,
    country: p.country,
    foreign: isForeign(p),
    summary: summaries.get(p.id)!,
  }));
}

export type Attention = {
  partyId: string;
  partyName: string;
  typeCode: string;
  status: "expiring" | "expired";
  expiresOn: string;
};

export type PanelSummary = {
  /** Every supplier obligation in the company, counted like the supplier list. */
  requirements: RequirementSummary;
  suppliers: { total: number; pendingApproval: number; conditional: number };
  documentsToReview: number;
  /** Expired and soon-to-expire documents, most urgent first. */
  attention: Attention[];
};

export async function getPanelSummary(ctx: RequestContext): Promise<PanelSummary> {
  requirePermission(ctx, "suppliers.view");
  const data = loadData(ctx);
  const { obligations } = summarize(ctx, data);
  const names = new Map(data.parties.map((p) => [p.id, p.name]));
  const sourceMaker = new Map(data.sources.map((s) => [s.id, s.manufacturerId]));
  const siteParty = new Map(data.sites.map((s) => [s.id, s.partyId]));

  const attention: Attention[] = obligations
    .filter((o) => (o.status === "expiring" || o.status === "expired") && o.document && o.expiresOn)
    .map((o) => {
      const subject = o.requirement.subject;
      const partyId =
        subject.kind === "party"
          ? subject.partyId
          : subject.kind === "site"
            ? (siteParty.get(subject.siteId) ?? "")
            : (sourceMaker.get(subject.sourceId) ?? "");
      return {
        partyId,
        partyName: names.get(partyId) ?? "",
        typeCode: o.document!.typeCode,
        status: o.status as Attention["status"],
        expiresOn: o.expiresOn!,
      };
    })
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));

  return {
    requirements: summarizeObligations(obligations),
    suppliers: {
      total: data.parties.filter((p) => p.lifecycle !== "inactive").length,
      pendingApproval: data.parties.filter((p) => p.approval === "pending" && p.lifecycle !== "inactive").length,
      conditional: data.parties.filter((p) => p.approval === "conditional").length,
    },
    documentsToReview: data.documents.filter((d) => d.state === "pending_review").length,
    attention,
  };
}

/** One supplier with its requirements, sites, materials and documents, or null if it doesn't exist. */
export async function getSupplier(ctx: RequestContext, partyId: string): Promise<SupplierDetail | null> {
  requirePermission(ctx, "suppliers.view");
  const data = loadData(ctx);
  return buildSupplierDetail(data, partyId, ctx.today, SAMPLE_USERS, data.requirementPolicy);
}

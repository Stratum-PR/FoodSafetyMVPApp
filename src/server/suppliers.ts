import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_CATALOG } from "@/domain/catalog";
import { summarizeObligations, type RequirementSummary } from "@/domain/obligations";
import { summarizeSuppliers, type SupplierSummary } from "@/domain/supplier-summary";
import type { PartyType, Lifecycle } from "@/domain/suppliers";
import { isForeign, legacySite } from "@/domain/suppliers";
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
import {
  checkNewSupplier,
  type NewSupplierError,
  type NewSupplierField,
  type NewSupplierInput,
} from "@/domain/new-supplier";
import type { Severity } from "@/domain/nonconformity";

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
  lifecycle: Lifecycle;
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
    lifecycle: p.lifecycle,
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
  /** Every supplier obligation in the company, counted like the supplier list. */
  requirements: RequirementSummary;
  suppliers: { total: number; active: number; pendingApproval: number; conditional: number };
  documentsToReview: number;
  /** Expired and soon-to-expire documents, most urgent first. */
  attention: Attention[];
  operations: PanelOperations;
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

  const named = <T extends { partyId: string }>(list: T[]): (T & NamedParty)[] =>
    list.map((x) => ({ ...x, partyName: names.get(x.partyId) ?? "" }));
  const materialNames = new Map(data.materials.map((m) => [m.id, m.name]));
  const ncs = nonconformityOutlook(data.nonconformities ?? [], ctx.today);
  const fda = fdaRenewalPeriod(ctx.today);
  const queue = reviewQueue(data.documents, ctx.today);

  return {
    requirements: summarizeObligations(obligations),
    suppliers: {
      total: data.parties.filter((p) => p.lifecycle !== "inactive").length,
      pendingApproval: data.parties.filter((p) => p.approval === "pending" && p.lifecycle !== "inactive").length,
      active: data.parties.filter(isActiveSupplier).length,
      conditional: data.parties.filter((p) => p.approval === "conditional").length,
    },
    documentsToReview: queue.count,
    attention,
    operations: {
      expiry: expiryOutlook(obligations, ctx.today),
      reviewQueue: queue,
      conditionsDue: named(conditionsDue(data.parties, ctx.today)),
      nonconformities: { bySeverity: ncs.bySeverity, repeat: named(ncs.repeat) },
      suspendedActive: named(suspendedWithActiveSources(data.parties, data.sources)),
      highRisk: highRiskGaps(data.sources, obligations).map((x) => ({
        partyId: x.manufacturerId,
        partyName: names.get(x.manufacturerId) ?? "",
        sourceId: x.sourceId,
        materialName: materialNames.get(x.materialId) ?? "",
        gaps: x.gaps,
      })),
      fsvp: named(fsvpGaps(obligations).map((partyId) => ({ partyId }))),
      fdaRenewal: {
        ...fda,
        due: named(fdaRenewalsDue(obligations, fda.opensOn, data.sites).map((partyId) => ({ partyId }))),
      },
    },
  };
}

/** One supplier with its requirements, sites, materials and documents, or null if it doesn't exist. */
export async function getSupplier(ctx: RequestContext, partyId: string): Promise<SupplierDetail | null> {
  requirePermission(ctx, "suppliers.view");
  const data = loadData(ctx);
  return buildSupplierDetail(data, partyId, ctx.today, SAMPLE_USERS, data.requirementPolicy);
}

export type CreateSupplierOutcome =
  { ok: true; id: string } | { ok: false; errors: Partial<Record<NewSupplierField, NewSupplierError>> };

/** Adds a supplier in onboarding, pending approval, and records who added it. */
export async function createSupplier(ctx: RequestContext, input: NewSupplierInput): Promise<CreateSupplierOutcome> {
  requirePermission(ctx, "suppliers.edit");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const check = checkNewSupplier(
    input,
    store.parties.map((p) => p.name),
  );
  if (!check.ok) return check;

  const id = `p-${randomUUID()}`;
  store.parties.push({
    id,
    ...check.value,
    direction: "request",
    lifecycle: "onboarding",
    approval: "pending",
    createdBy: ctx.actor.userId,
  });
  store.sites.push(legacySite({ id, ...check.value }));
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: "supplier.created",
    partyId: id,
  });
  return { ok: true, id };
}

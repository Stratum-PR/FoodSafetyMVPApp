import "server-only";

import { randomUUID } from "node:crypto";

import {
  type ApprovalAction,
  type ApprovalError,
  type ApprovalField,
  type ApprovalRecord,
  type ApprovalWarning,
  approvalWarnings,
  availableActions,
  checkApprovalAction,
  decideApproval,
} from "@/domain/approval";
import { DEFAULT_CATALOG } from "@/domain/catalog";
import { AppError } from "@/domain/errors";
import {
  checkClose,
  checkNonconformity,
  type CloseError,
  isOpen,
  type Nonconformity,
  type NonconformityError,
  type NonconformityField,
} from "@/domain/nonconformity";
import { isUnmet, obligationsForParty, summarizeObligations } from "@/domain/obligations";
import { can, DEFAULT_REVIEW_POLICY, type Denial } from "@/domain/permissions";
import { CATALOG_VERSION } from "@/domain/programs";
import { summarizeSuppliers } from "@/domain/supplier-summary";
import { type Approval, type ApprovalTerms, involves, type Lifecycle } from "@/domain/suppliers";

import { type RequestContext, requirePermission } from "./context";
import { getSampleStore, type SampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";

/*
 * Supplier approval and nonconformities. Every decision becomes a new approval record (the
 * history is never rewritten) plus an activity event for Historial.
 */

const userName = (id: string) => SAMPLE_USERS.find((u) => u.id === id)?.name ?? id;

function requirementsOf(store: SampleStore, partyId: string, today: string) {
  const { obligations } = summarizeSuppliers(store, {
    catalog: DEFAULT_CATALOG,
    today,
    policy: store.requirementPolicy,
  });
  const mine = obligationsForParty(partyId, obligations, store.sites, store.sources);
  return { summary: summarizeObligations(mine), obligations: mine };
}

export type ApprovalPanel = {
  approval: Approval;
  lifecycle: Lifecycle;
  terms?: ApprovalTerms & { ownerName?: string };
  /** The decisions this person can take now. */
  actions: ApprovalAction[];
  /** Why there are none, when the supplier has decisions available but this person can't take them. */
  denial: Denial | null;
  warnings: ApprovalWarning[];
  /** Unmet blocking requirements: a full approval waits for them. */
  blockingOpen: number;
  history: (ApprovalRecord & { actorName: string; ownerName?: string })[];
  nonconformities: (Nonconformity & { recordedByName: string; closedByName?: string })[];
  canRecordNonconformity: boolean;
  /** Who can own conditions, and the supplier's sources, for the conditional form. */
  owners: { id: string; name: string }[];
  sources: { id: string; label: string; active: boolean }[];
};

export async function getApprovalPanel(ctx: RequestContext, partyId: string): Promise<ApprovalPanel | null> {
  requirePermission(ctx, "suppliers.view");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const party = store.parties.find((p) => p.id === partyId);
  if (!party) return null;

  const policy = store.policy ?? DEFAULT_REVIEW_POLICY;
  const available = availableActions(party);
  const actions = available.filter((a) => checkApprovalAction(ctx.actor, party, a, policy) === null);
  const denial =
    available.length && !actions.length ? checkApprovalAction(ctx.actor, party, available[0], policy) : null;

  const { summary } = requirementsOf(store, party.id, ctx.today);
  const ncs = store.nonconformities.filter((n) => n.partyId === party.id);
  const materials = new Map(store.materials.map((m) => [m.id, m]));
  const unmet = summary.counts.missing + summary.counts.expired + summary.counts.rejected;

  return {
    approval: party.approval,
    lifecycle: party.lifecycle,
    terms: party.terms
      ? { ...party.terms, ownerName: party.terms.owner ? userName(party.terms.owner) : undefined }
      : undefined,
    actions,
    denial,
    warnings: approvalWarnings(
      party,
      unmet,
      summary.blockingOpen,
      ncs.map((n) => n.date),
      ctx.today,
    ),
    blockingOpen: summary.blockingOpen,
    history: store.approvals
      .filter((a) => a.partyId === party.id)
      .map((a) => ({
        ...a,
        actorName: userName(a.actorId),
        ownerName: a.terms?.owner ? userName(a.terms.owner) : undefined,
      }))
      .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id)),
    nonconformities: ncs
      .map((n) => ({
        ...n,
        recordedByName: userName(n.recordedBy),
        closedByName: n.closedBy ? userName(n.closedBy) : undefined,
      }))
      .sort(
        (a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      ),
    canRecordNonconformity: can(ctx.actor.role, "nonconformities.record"),
    owners: SAMPLE_USERS.map((u) => ({ id: u.id, name: u.name })),
    sources: store.sources
      .filter((s) => s.manufacturerId === party.id || s.distributorId === party.id)
      .map((s) => ({
        id: s.id,
        label: `${materials.get(s.materialId)?.name ?? s.materialId} (${materials.get(s.materialId)?.code ?? ""})`,
        active: s.commercial === "active",
      })),
  };
}

export type StatusInput = {
  action: string;
  reason: string;
  basis: string[];
  reviewBy: string;
  conditions: string;
  owner: string;
  effectiveOn: string;
  allowedSourceIds: string[];
  restrictions: string[];
};

export type StatusOutcome =
  { ok: true } | { ok: false; errors: Partial<Record<ApprovalField, ApprovalError>> } | { ok: false; denial: Denial };

export async function changeSupplierStatus(
  ctx: RequestContext,
  partyId: string,
  input: StatusInput,
): Promise<StatusOutcome> {
  requirePermission(ctx, "suppliers.view");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const party = store.parties.find((p) => p.id === partyId);
  if (!party) throw new AppError("not_found", "supplier");

  const available = availableActions(party);
  const action = available.find((a) => a === input.action);
  if (!action) return { ok: false, errors: { action: "not_available" } };
  const denial = checkApprovalAction(ctx.actor, party, action, store.policy ?? DEFAULT_REVIEW_POLICY);
  if (denial) return { ok: false, denial };

  const before = requirementsOf(store, party.id, ctx.today);
  const check = decideApproval(party, { ...input, action }, ctx.today, {
    blockingOpen: before.obligations.filter((o) => o.requirement.blocking && isUnmet(o.status)).length,
    owners: SAMPLE_USERS.map((u) => u.id),
    sourceIds: store.sources.filter((s) => involves(s, party.id)).map((s) => s.id),
  });
  if (!check.ok) return check;
  const { change } = check;

  const updated = { ...party, approval: change.approval, lifecycle: change.lifecycle, terms: change.terms };
  store.parties = store.parties.map((p) => (p.id === party.id ? updated : p));
  store.approvals.push({
    id: `ap-${randomUUID()}`,
    partyId: party.id,
    on: ctx.today,
    actorId: ctx.actor.userId,
    action,
    from: { approval: party.approval, lifecycle: party.lifecycle },
    to: { approval: updated.approval, lifecycle: updated.lifecycle },
    reason: change.reason,
    basis: change.basis,
    // Only decisions that set terms record them; the others leave the history uncluttered.
    terms: action === "approve" || action === "approve_conditional" ? change.terms : undefined,
    ruleVersion: CATALOG_VERSION,
    requirementsAt: { met: before.summary.met, applicable: before.summary.applicable },
  });
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: "supplier.status_changed",
    partyId: party.id,
    detail: action,
  });
  return { ok: true };
}

export type NonconformityOutcome =
  { ok: true } | { ok: false; errors: Partial<Record<NonconformityField, NonconformityError>> };

export async function recordNonconformity(
  ctx: RequestContext,
  partyId: string,
  input: { date: string; severity: string; description: string; lotCode: string },
): Promise<NonconformityOutcome> {
  requirePermission(ctx, "nonconformities.record");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  if (!store.parties.some((p) => p.id === partyId)) throw new AppError("not_found", "supplier");

  const check = checkNonconformity(input, ctx.today);
  if (!check.ok) return check;
  store.nonconformities.push({
    id: `nc-${randomUUID()}`,
    partyId,
    ...check.value,
    recordedBy: ctx.actor.userId,
    recordedOn: ctx.today,
    status: "open",
  });
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: "supplier.nonconformity_recorded",
    partyId,
    detail: check.value.severity,
  });
  return { ok: true };
}

/** Closes an open nonconformity with a note of what was done. The record itself stays. */
export async function closeNonconformity(
  ctx: RequestContext,
  partyId: string,
  nonconformityId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: CloseError }> {
  requirePermission(ctx, "nonconformities.record");
  const store = getSampleStore(ctx.company.slug, ctx.today);
  const nc = store.nonconformities.find((n) => n.id === nonconformityId && n.partyId === partyId);
  if (!nc) throw new AppError("not_found", "nonconformity");
  const error = checkClose(nc, note);
  if (error) return { ok: false, error };
  store.nonconformities = store.nonconformities.map((n) =>
    n.id === nc.id
      ? { ...n, status: "closed", closedBy: ctx.actor.userId, closedOn: ctx.today, closeNote: note.trim() }
      : n,
  );
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: ctx.actor.userId,
    action: "supplier.nonconformity_closed",
    partyId,
    detail: nc.id,
  });
  return { ok: true };
}

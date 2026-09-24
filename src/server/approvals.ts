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
import { evaluateCompliance, resultsForParty, summarize } from "@/domain/compliance";
import { AppError } from "@/domain/errors";
import {
  checkNonconformity,
  type Nonconformity,
  type NonconformityError,
  type NonconformityField,
} from "@/domain/nonconformity";
import { can, DEFAULT_REVIEW_POLICY, type Denial } from "@/domain/permissions";
import type { Approval, Lifecycle } from "@/domain/suppliers";

import { type RequestContext, requirePermission } from "./context";
import { getSampleStore, type SampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";

/*
 * Supplier approval and nonconformities. Every decision becomes a new approval record (the
 * history is never rewritten) plus an activity event for Historial.
 */

const userName = (id: string) => SAMPLE_USERS.find((u) => u.id === id)?.name ?? id;

/** Stores created before approvals existed (a running dev server) start with empty lists. */
function lists(store: SampleStore) {
  store.approvals ??= [];
  store.nonconformities ??= [];
  return store;
}

function compliance(store: SampleStore, partyId: string, today: string) {
  const results = evaluateCompliance(store, store.documents, DEFAULT_CATALOG, today);
  return summarize(resultsForParty(partyId, results, store.sources));
}

export type ApprovalPanel = {
  approval: Approval;
  lifecycle: Lifecycle;
  conditions?: string;
  conditionsReviewBy?: string;
  /** The decisions this person can take now. */
  actions: ApprovalAction[];
  /** Why there are none, when the supplier has decisions available but this person can't take them. */
  denial: Denial | null;
  warnings: ApprovalWarning[];
  history: (ApprovalRecord & { actorName: string })[];
  nonconformities: (Nonconformity & { recordedByName: string })[];
  canRecordNonconformity: boolean;
};

export async function getApprovalPanel(ctx: RequestContext, partyId: string): Promise<ApprovalPanel | null> {
  requirePermission(ctx, "suppliers.view");
  const store = lists(getSampleStore(ctx.company.slug, ctx.today));
  const party = store.parties.find((p) => p.id === partyId);
  if (!party) return null;

  const policy = store.policy ?? DEFAULT_REVIEW_POLICY;
  const available = availableActions(party);
  const actions = available.filter((a) => checkApprovalAction(ctx.actor, party, a, policy) === null);
  const denial =
    available.length && !actions.length ? checkApprovalAction(ctx.actor, party, available[0], policy) : null;

  const summary = compliance(store, party.id, ctx.today);
  const ncs = store.nonconformities.filter((n) => n.partyId === party.id);

  return {
    approval: party.approval,
    lifecycle: party.lifecycle,
    conditions: party.conditions,
    conditionsReviewBy: party.conditionsReviewBy,
    actions,
    denial,
    warnings: approvalWarnings(
      party,
      summary.counts.expired + summary.counts.missing,
      ncs.map((n) => n.date),
      ctx.today,
    ),
    history: store.approvals
      .filter((a) => a.partyId === party.id)
      .map((a) => ({ ...a, actorName: userName(a.actorId) }))
      .reverse(),
    nonconformities: ncs
      .map((n) => ({ ...n, recordedByName: userName(n.recordedBy) }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    canRecordNonconformity: can(ctx.actor.role, "nonconformities.record"),
  };
}

export type StatusOutcome =
  { ok: true } | { ok: false; errors: Partial<Record<ApprovalField, ApprovalError>> } | { ok: false; denial: Denial };

export async function changeSupplierStatus(
  ctx: RequestContext,
  partyId: string,
  input: { action: string; reason: string; conditions: string; reviewBy: string },
): Promise<StatusOutcome> {
  requirePermission(ctx, "suppliers.view");
  const store = lists(getSampleStore(ctx.company.slug, ctx.today));
  const party = store.parties.find((p) => p.id === partyId);
  if (!party) throw new AppError("not_found", "supplier");

  const available = availableActions(party);
  const action = available.find((a) => a === input.action);
  if (!action) return { ok: false, errors: { action: "not_available" } };
  const denial = checkApprovalAction(ctx.actor, party, action, store.policy ?? DEFAULT_REVIEW_POLICY);
  if (denial) return { ok: false, denial };

  const check = decideApproval(party, { ...input, action }, ctx.today);
  if (!check.ok) return check;
  const { change } = check;

  const conditional = change.approval === "conditional";
  const updated = {
    ...party,
    approval: change.approval,
    lifecycle: change.lifecycle,
    // Conditions stay while the approval is conditional (even if deactivated); otherwise cleared.
    conditions: conditional ? (change.conditions ?? party.conditions) : undefined,
    conditionsReviewBy: conditional ? (change.conditionsReviewBy ?? party.conditionsReviewBy) : undefined,
  };
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
    conditions: change.conditions,
    reviewBy: change.conditionsReviewBy,
    compliancePercent: compliance(store, party.id, ctx.today).percent,
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
  const store = lists(getSampleStore(ctx.company.slug, ctx.today));
  if (!store.parties.some((p) => p.id === partyId)) throw new AppError("not_found", "supplier");

  const check = checkNonconformity(input, ctx.today);
  if (!check.ok) return check;
  store.nonconformities.push({
    id: `nc-${randomUUID()}`,
    partyId,
    ...check.value,
    recordedBy: ctx.actor.userId,
    recordedOn: ctx.today,
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

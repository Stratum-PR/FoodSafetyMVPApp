import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { ActivityAction } from "@/domain/activity";
import { DEFAULT_CATALOG } from "@/domain/catalog";
import { addDays, type IsoDate } from "@/domain/dates";
import { AppError } from "@/domain/errors";
import type { EmailTemplate, RecordRef } from "@/domain/notifications";
import { evaluateObligations, type Obligation, type ObligationStatus } from "@/domain/obligations";
import { portalExpiry } from "@/domain/portal";
import type { ProgramCode, RequirementCode } from "@/domain/programs";
import { nextRequestReminder } from "@/domain/reminders";
import {
  batchStatus,
  type BatchStatus,
  checkNewRequest,
  DEFAULT_DUE_DAYS,
  type DocumentRequest,
  isItemOpen,
  itemResolved,
  itemReviewed,
  itemWaived,
  newItem,
  type NewRequestError,
  type NewRequestField,
  openRequirementKeys,
  type RequestItemStatus,
  type RequestProgress,
  requestableGaps,
  requestProgress,
} from "@/domain/requests";
import type { Contact, DocumentSubject, SupplierDocument } from "@/domain/suppliers";

import { type RequestContext, requirePermission } from "./context";
import { renderEmail } from "./email/templates";
import { emailSender } from "./email/sender";
import { getSampleStore, type SampleStore } from "./sample/store";
import { SAMPLE_USERS } from "./sample/suppliers";
import { getWorkflowStore, type WorkflowStore } from "./sample/workflow-store";

/*
 * Requests service: build a request from a supplier's real gaps, send it (bilingual email to the
 * outbox plus a link to copy for WhatsApp), and follow it. Link secrets are returned once, when
 * created, and only their hash is kept. Every change is an activity event.
 */

export const REASON_MIN = 5;
export const REASON_MAX = 500;

type Stores = { store: SampleStore; flow: WorkflowStore };
function stores(ctx: RequestContext): Stores {
  return { store: getSampleStore(ctx.company.slug, ctx.today), flow: getWorkflowStore(ctx.company.slug, ctx.today) };
}

export function obligationsOf(store: SampleStore, today: IsoDate): Obligation[] {
  return evaluateObligations({
    data: store,
    documents: store.documents,
    overrides: store.overrides ?? [],
    catalog: DEFAULT_CATALOG,
    today,
  });
}

/** Who and what a subject is, for showing a request item or document. */
export type SubjectLabel = { partyId: string; partyName: string; site?: string; material?: string };

export function describeSubject(store: SampleStore, subject: DocumentSubject): SubjectLabel {
  const party = (id: string) => store.parties.find((p) => p.id === id);
  if (subject.kind === "party") return { partyId: subject.partyId, partyName: party(subject.partyId)?.name ?? "" };
  if (subject.kind === "site") {
    const site = store.sites.find((s) => s.id === subject.siteId);
    const p = site ? party(site.partyId) : undefined;
    return {
      partyId: p?.id ?? "",
      partyName: p?.name ?? "",
      site: site ? [site.name, site.city].filter(Boolean).join(", ") : undefined,
    };
  }
  const source = store.sources.find((s) => s.id === subject.sourceId);
  const p = source ? party(source.manufacturerId) : undefined;
  const site = source ? store.sites.find((s) => s.id === source.siteId) : undefined;
  return {
    partyId: p?.id ?? "",
    partyName: p?.name ?? "",
    site: site ? [site.name, site.city].filter(Boolean).join(", ") : undefined,
    material: store.materials.find((m) => m.id === source?.materialId)?.name,
  };
}

function event(
  store: SampleStore,
  actorId: string,
  action: ActivityAction,
  partyId: string,
  extra: { requestId?: string; documentId?: string; detail?: string } = {},
) {
  store.events.push({ id: randomUUID(), at: new Date().toISOString(), actorId, action, partyId, ...extra });
}

const userName = (id: string) => SAMPLE_USERS.find((u) => u.id === id)?.name ?? id;

/* Lists */

export type RequestRow = {
  id: string;
  partyId: string;
  partyName: string;
  contact: { name: string; email: string } | null;
  progress: RequestProgress;
  programs: ProgramCode[];
  status: BatchStatus;
  createdAt: string;
  sentAt?: string;
  dueOn: IsoDate;
  lastActivityAt: string;
  nextReminder: { on: IsoDate; kind: string } | null;
};

function toRow(r: DocumentRequest, store: SampleStore, flow: WorkflowStore, today: IsoDate): RequestRow {
  const contact = store.contacts.find((c) => c.id === r.contactId);
  return {
    id: r.id,
    partyId: r.partyId,
    partyName: store.parties.find((p) => p.id === r.partyId)?.name ?? "",
    contact: contact ? { name: contact.name, email: contact.email } : null,
    progress: requestProgress(r.items),
    programs: [...new Set(r.items.map((i) => i.program))],
    status: batchStatus(r, today),
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    dueOn: r.dueOn,
    lastActivityAt: r.lastActivityAt,
    nextReminder: nextRequestReminder(r, today, flow.sentReminders),
  };
}

export async function listRequests(ctx: RequestContext): Promise<RequestRow[]> {
  requirePermission(ctx, "requests.send");
  const { store, flow } = stores(ctx);
  return flow.requests
    .map((r) => toRow(r, store, flow, ctx.today))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.id.localeCompare(b.id));
}

/* Detail */

export type RequestItemView = {
  id: string;
  code: RequirementCode;
  program: ProgramCode;
  subject: SubjectLabel;
  status: RequestItemStatus;
  rejectionReason?: string;
  waivedReason?: string;
  documents: { id: string; state: SupplierDocument["state"]; receivedOn: IsoDate; fileName?: string }[];
};

export type RequestDetail = RequestRow & {
  language: "es" | "en";
  message?: string;
  state: DocumentRequest["state"];
  cancelledReason?: string;
  createdByName: string;
  sentByName?: string;
  items: RequestItemView[];
  /** The active link, without its secret (it's never stored). */
  link: { expiresOn: IsoDate; lastUsedAt?: string } | null;
  emails: { at: string; toEmail: string; template: EmailTemplate; status: string; providerId: string }[];
  events: { at: string; action: ActivityAction; actorName: string; detail?: string }[];
};

export async function getRequest(ctx: RequestContext, id: string): Promise<RequestDetail | null> {
  requirePermission(ctx, "requests.send");
  const { store, flow } = stores(ctx);
  const r = flow.requests.find((x) => x.id === id);
  if (!r) return null;
  const docs = new Map(store.documents.map((d) => [d.id, d]));
  const token = flow.tokens.find((t) => t.requestId === id && !t.revokedAt);
  const contacts = new Map(store.contacts.map((c) => [c.id, c]));
  const actorName = (actorId: string) =>
    actorId.startsWith("portal:") ? (contacts.get(actorId.slice(7))?.name ?? actorId) : userName(actorId);
  return {
    ...toRow(r, store, flow, ctx.today),
    language: r.language,
    message: r.message,
    state: r.state,
    cancelledReason: r.cancelledReason,
    createdByName: userName(r.createdBy),
    sentByName: r.sentBy ? userName(r.sentBy) : undefined,
    items: r.items.map((i) => ({
      id: i.id,
      code: i.code,
      program: i.program,
      subject: describeSubject(store, i.subject),
      status: i.status,
      rejectionReason: i.rejectionReason,
      waivedReason: i.waivedReason,
      documents: i.documentIds
        .map((d) => docs.get(d))
        .filter((d): d is SupplierDocument => Boolean(d))
        .map((d) => ({ id: d.id, state: d.state, receivedOn: d.receivedOn, fileName: d.file?.name })),
    })),
    link: token && token.expiresOn >= ctx.today ? { expiresOn: token.expiresOn, lastUsedAt: token.lastUsedAt } : null,
    emails: flow.emailLog
      .filter((e) => e.record.kind === "request" && e.record.id === id)
      .map(({ at, toEmail, template, status, providerId }) => ({ at, toEmail, template, status, providerId })),
    events: store.events
      .filter((e) => e.requestId === id)
      .map((e) => ({ at: e.at, action: e.action, actorName: actorName(e.actorId), detail: e.detail }))
      .sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/* New request */

export type GapView = {
  key: string;
  code: RequirementCode;
  program: ProgramCode;
  status: ObligationStatus;
  subject: SubjectLabel;
  blocking: boolean;
  /** Already asked for in another open request. */
  requested: boolean;
};

export type RequestTarget = {
  partyId: string;
  partyName: string;
  contacts: Pick<Contact, "id" | "name" | "email" | "language" | "isPrimary">[];
  gaps: GapView[];
};

/** Gaps of each supplier, and the parties' contacts, for the new-request form. */
export async function listRequestTargets(ctx: RequestContext): Promise<RequestTarget[]> {
  requirePermission(ctx, "requests.send");
  const { store, flow } = stores(ctx);
  const open = openRequirementKeys(flow.requests);
  const byParty = new Map<string, GapView[]>();
  for (const o of requestableGaps(obligationsOf(store, ctx.today))) {
    const subject = describeSubject(store, o.requirement.subject);
    // Material documents are asked of the manufacturer; party and site documents of their owner.
    const list = byParty.get(subject.partyId) ?? [];
    list.push({
      key: o.requirement.key,
      code: o.requirement.code,
      program: o.requirement.program,
      status: o.status,
      subject,
      blocking: o.requirement.blocking,
      requested: open.has(o.requirement.key),
    });
    byParty.set(subject.partyId, list);
  }
  return store.parties
    .filter((p) => byParty.has(p.id))
    .map((p) => ({
      partyId: p.id,
      partyName: p.name,
      contacts: store.contacts
        .filter((c) => c.partyId === p.id)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map(({ id, name, email, language, isPrimary }) => ({ id, name, email, language, isPrimary })),
      gaps: byParty.get(p.id)!,
    }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, "es"));
}

export function defaultDueOn(today: IsoDate): IsoDate {
  return addDays(today, DEFAULT_DUE_DAYS);
}

export type CreateInput = {
  partyId: string;
  contactId: string;
  requirementKeys: string[];
  dueOn: string;
  language: string;
  message: string;
  send: boolean;
};

export type CreateOutcome =
  | { ok: true; id: string; link?: string }
  | { ok: false; errors: Partial<Record<NewRequestField | "partyId", NewRequestError>> };

export async function createRequest(ctx: RequestContext, input: CreateInput, origin: string): Promise<CreateOutcome> {
  requirePermission(ctx, "requests.send");
  const { store, flow } = stores(ctx);
  const party = store.parties.find((p) => p.id === input.partyId);
  if (!party) return { ok: false, errors: { partyId: "required" } };

  const gaps = requestableGaps(obligationsOf(store, ctx.today))
    .map((o) => o.requirement)
    .filter((r) => describeSubject(store, r.subject).partyId === party.id);
  const check = checkNewRequest(input, {
    contactIds: store.contacts.filter((c) => c.partyId === party.id).map((c) => c.id),
    gaps,
    openKeys: openRequirementKeys(flow.requests),
    today: ctx.today,
  });
  if (!check.ok) return check;

  const at = new Date().toISOString();
  const request: DocumentRequest = {
    id: `req-${randomUUID()}`,
    partyId: party.id,
    contactId: input.contactId,
    language: check.language,
    dueOn: check.dueOn,
    message: check.message,
    state: "draft",
    items: check.requirements.map((r) => newItem(`item-${randomUUID()}`, r, at)),
    createdBy: ctx.actor.userId,
    createdAt: at,
    lastActivityAt: at,
  };
  flow.requests.push(request);
  event(store, ctx.actor.userId, "request.created", party.id, {
    requestId: request.id,
    detail: String(request.items.length),
  });
  if (!input.send) return { ok: true, id: request.id };
  const sent = await sendRequest(ctx, request.id, origin);
  return { ok: true, id: request.id, link: sent.link };
}

/* Sending and links */

export function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function portalPath(secret: string): string {
  return `/portal/${secret}`;
}

/** A new link for the request; any previous link stops working. Returns the secret once. */
function newLink(ctx: RequestContext, { store, flow }: Stores, request: DocumentRequest): string {
  const at = new Date().toISOString();
  for (const t of flow.tokens) if (t.requestId === request.id && !t.revokedAt) t.revokedAt = at;
  const secret = randomBytes(32).toString("base64url");
  flow.tokens.push({
    id: randomUUID(),
    companySlug: ctx.company.slug,
    requestId: request.id,
    tokenHash: hashToken(secret),
    createdAt: at,
    expiresOn: portalExpiry(ctx.today),
  });
  event(store, ctx.actor.userId, "request.link_created", request.partyId, { requestId: request.id });
  return secret;
}

/** Logs an email to a contact through the configured sender (the outbox until email is set up). */
export async function emailContact(
  flow: WorkflowStore,
  contact: Contact,
  template: EmailTemplate,
  record: RecordRef,
  content: { subject: string; text: string },
) {
  const result = await emailSender().send({ to: contact.email, ...content });
  flow.emailLog.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    toEmail: contact.email,
    contactId: contact.id,
    template,
    language: contact.language,
    record,
    ...result,
  });
}

/** Sends a draft (or sends again): a fresh link and the bilingual email. */
export async function sendRequest(ctx: RequestContext, id: string, origin: string): Promise<{ link: string }> {
  requirePermission(ctx, "requests.send");
  const s = stores(ctx);
  const request = s.flow.requests.find((r) => r.id === id);
  if (!request) throw new AppError("not_found", "request");
  if (request.state === "cancelled") throw new AppError("conflict", "cancelled");
  const contact = s.store.contacts.find((c) => c.id === request.contactId);
  if (!contact) throw new AppError("conflict", "no_contact");

  const secret = newLink(ctx, s, request);
  const at = new Date().toISOString();
  const first = request.state === "draft";
  Object.assign(request, {
    state: "sent",
    sentBy: request.sentBy ?? ctx.actor.userId,
    sentAt: request.sentAt ?? at,
    lastActivityAt: at,
  });
  const link = `${origin}${portalPath(secret)}`;
  const content = await renderEmail("request", request.language, {
    company: ctx.company.name,
    party: s.store.parties.find((p) => p.id === request.partyId)?.name ?? "",
    count: request.items.filter(isItemOpen).length,
    dueOn: request.dueOn,
    link,
    message: request.message ?? "",
  });
  await emailContact(s.flow, contact, "request", { kind: "request", id }, content);
  event(s.store, ctx.actor.userId, "request.sent", request.partyId, {
    requestId: id,
    detail: first ? undefined : "resent",
  });
  return { link };
}

/** A new link to copy (e.g. for WhatsApp) without emailing again. */
export async function regenerateLink(ctx: RequestContext, id: string, origin: string): Promise<{ link: string }> {
  requirePermission(ctx, "requests.send");
  const s = stores(ctx);
  const request = s.flow.requests.find((r) => r.id === id);
  if (!request) throw new AppError("not_found", "request");
  if (request.state !== "sent") throw new AppError("conflict", request.state);
  return { link: `${origin}${portalPath(newLink(ctx, s, request))}` };
}

export type ReasonOutcome = { ok: true } | { ok: false; error: "reason_required" | "reason_too_long" | "closed" };

function checkReason(reason: string): ReasonOutcome | null {
  const r = reason.trim();
  if (r.length < REASON_MIN) return { ok: false, error: "reason_required" };
  if (r.length > REASON_MAX) return { ok: false, error: "reason_too_long" };
  return null;
}

/** Cancels a request with a reason. Its link stops working; items and documents stay on record. */
export async function cancelRequest(ctx: RequestContext, id: string, reason: string): Promise<ReasonOutcome> {
  requirePermission(ctx, "requests.send");
  const { store, flow } = stores(ctx);
  const request = flow.requests.find((r) => r.id === id);
  if (!request) throw new AppError("not_found", "request");
  const bad = checkReason(reason);
  if (bad) return bad;
  if (request.state === "cancelled") return { ok: false, error: "closed" };
  const at = new Date().toISOString();
  Object.assign(request, { state: "cancelled", cancelledReason: reason.trim(), lastActivityAt: at });
  for (const t of flow.tokens) if (t.requestId === id && !t.revokedAt) t.revokedAt = at;
  event(store, ctx.actor.userId, "request.cancelled", request.partyId, { requestId: id, detail: reason.trim() });
  return { ok: true };
}

/** Closes one item on purpose (e.g. no longer bought), with a reason on record. */
export async function waiveItem(
  ctx: RequestContext,
  id: string,
  itemId: string,
  reason: string,
): Promise<ReasonOutcome> {
  requirePermission(ctx, "requests.send");
  const { store, flow } = stores(ctx);
  const request = flow.requests.find((r) => r.id === id);
  const index = request?.items.findIndex((i) => i.id === itemId) ?? -1;
  if (!request || index < 0) throw new AppError("not_found", "request_item");
  const bad = checkReason(reason);
  if (bad) return bad;
  const at = new Date().toISOString();
  const next = itemWaived(request.items[index], reason.trim(), at);
  if (typeof next === "string") return { ok: false, error: "closed" };
  request.items[index] = next;
  request.lastActivityAt = at;
  event(store, ctx.actor.userId, "request.item_waived", request.partyId, { requestId: id, detail: reason.trim() });
  return { ok: true };
}

/**
 * After a document is accepted or rejected: its own request item follows the decision (a
 * rejection goes back to the supplier with the reason), and on acceptance any other open item
 * asking for a requirement the document now meets is closed, so reminders stop.
 */
export function onDocumentReviewed(
  ctx: RequestContext,
  doc: SupplierDocument,
  decision: "accept" | "reject",
  reason: string,
  coveredKeys: string[],
): void {
  const flow = getWorkflowStore(ctx.company.slug, ctx.today);
  const at = new Date().toISOString();
  for (const request of flow.requests) {
    if (request.state === "cancelled") continue;
    let touched = false;
    request.items = request.items.map((item) => {
      if (doc.requestItemId === item.id) {
        touched = true;
        return itemReviewed(item, decision, reason, at);
      }
      if (decision === "accept" && isItemOpen(item) && coveredKeys.includes(item.requirementKey)) {
        touched = true;
        return itemResolved(item, at);
      }
      return item;
    });
    if (touched) request.lastActivityAt = at;
  }
}

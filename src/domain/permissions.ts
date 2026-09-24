/*
 * Default roles and permissions. Roles are data: the SaaS owner can edit these and
 * create new roles later from the admin page. This matrix is the starting point.
 */

export const PERMISSIONS = [
  "suppliers.view",
  /** Add and edit suppliers, materials and approved sources. */
  "suppliers.edit",
  /** Approve, condition or suspend a supplier. */
  "suppliers.approve",
  "documents.view",
  "documents.upload",
  /** Accept or reject an uploaded document. */
  "documents.review",
  "requests.send",
  /** Record a supplier nonconformity (rejected lot, missing COA at receiving…). */
  "nonconformities.record",
  "import.bulk",
  "history.view",
  /** Document catalog and company settings. */
  "settings.manage",
  "users.manage",
  "billing.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["owner", "admin", "quality_manager", "staff", "purchasing", "warehouse", "viewer"] as const;

export type Role = (typeof ROLES)[number];

const ALL = new Set<Permission>(PERMISSIONS);

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: ALL,
  // Everything except billing.
  admin: new Set(PERMISSIONS.filter((p) => p !== "billing.manage")),
  quality_manager: new Set<Permission>([
    "suppliers.view",
    "suppliers.edit",
    "suppliers.approve",
    "documents.view",
    "documents.upload",
    "documents.review",
    "requests.send",
    "nonconformities.record",
    "import.bulk",
    "history.view",
    "settings.manage",
  ]),
  staff: new Set<Permission>([
    "suppliers.view",
    "suppliers.edit",
    "documents.view",
    "documents.upload",
    "documents.review",
    "requests.send",
    "nonconformities.record",
    "history.view",
  ]),
  // Proposes new suppliers and collects their documents; quality approves.
  purchasing: new Set<Permission>([
    "suppliers.view",
    "suppliers.edit",
    "documents.view",
    "documents.upload",
    "requests.send",
    "nonconformities.record",
  ]),
  // Checks the approved list at receiving, uploads per-lot documents (COA) and records problems.
  warehouse: new Set<Permission>(["suppliers.view", "documents.view", "documents.upload", "nonconformities.record"]),
  viewer: new Set<Permission>(["suppliers.view", "documents.view"]),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role].has(permission);
}

/** Roles that must use MFA. */
export function requiresMfa(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export type Actor = { userId: string; role: Role };

/* Separation of duties. Each rule returns a reason code when the action is not allowed. */

export type Denial = "no_permission" | "own_upload" | "own_supplier" | "last_owner";

/**
 * A company's choice about separation of duties. No standard requires it (FSMA 21 CFR 117
 * subpart G, FSVP, SQF 2.4.4 and GFSI ask for an approved-supplier program and its records,
 * not for two different people), and small teams often have one person doing everything.
 * So it's off by default; larger companies can require a second person in Ajustes.
 * Every decision records who made it either way.
 */
export type ReviewPolicy = {
  /** When on, nobody reviews a document they uploaded or approves a supplier they added. */
  requireSecondPerson: boolean;
};

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = { requireSecondPerson: false };

/** Who may accept or reject a document. */
export function checkReviewDocument(
  actor: Actor,
  doc: { uploadedBy: string },
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
): Denial | null {
  if (!can(actor.role, "documents.review")) return "no_permission";
  if (policy.requireSecondPerson && doc.uploadedBy === actor.userId) return "own_upload";
  return null;
}

/** Who may approve, condition, suspend or reinstate a supplier. */
export function checkApproveParty(
  actor: Actor,
  party: { createdBy: string },
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
): Denial | null {
  if (!can(actor.role, "suppliers.approve")) return "no_permission";
  if (policy.requireSecondPerson && party.createdBy === actor.userId) return "own_supplier";
  return null;
}

export type Member = { userId: string; role: Role; active: boolean };

/** A company always keeps at least one active Owner. `next` is the member list after the change. */
export function checkOwnersRemain(next: Member[]): Denial | null {
  return next.some((m) => m.active && m.role === "owner") ? null : "last_owner";
}

/** Who may change a member's role: users.manage, and only an Owner may grant or remove Owner. */
export function checkChangeRole(actor: Actor, from: Role, to: Role): Denial | null {
  if (!can(actor.role, "users.manage")) return "no_permission";
  if ((from === "owner" || to === "owner") && actor.role !== "owner") return "no_permission";
  return null;
}

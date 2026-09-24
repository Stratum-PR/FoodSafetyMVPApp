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
    "history.view",
  ]),
  // Proposes new suppliers and collects their documents; quality approves.
  purchasing: new Set<Permission>([
    "suppliers.view",
    "suppliers.edit",
    "documents.view",
    "documents.upload",
    "requests.send",
  ]),
  // Checks the approved list at receiving and uploads per-lot documents (COA).
  warehouse: new Set<Permission>(["suppliers.view", "documents.view", "documents.upload"]),
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

/** Nobody accepts or rejects a document they uploaded. */
export function checkReviewDocument(actor: Actor, doc: { uploadedBy: string }): Denial | null {
  if (!can(actor.role, "documents.review")) return "no_permission";
  if (doc.uploadedBy === actor.userId) return "own_upload";
  return null;
}

/**
 * Nobody approves a supplier they added. Exception: a company with a single Owner can
 * turn on self-approval for that Owner (small teams); every such approval is logged.
 */
export function checkApproveParty(
  actor: Actor,
  party: { createdBy: string },
  company: { ownerCount: number; allowSoleOwnerSelfApproval: boolean },
): Denial | null {
  if (!can(actor.role, "suppliers.approve")) return "no_permission";
  if (party.createdBy !== actor.userId) return null;
  const soleOwner = actor.role === "owner" && company.ownerCount === 1;
  return soleOwner && company.allowSoleOwnerSelfApproval ? null : "own_supplier";
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

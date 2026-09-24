import { describe, expect, it } from "vitest";

import {
  can,
  checkApproveParty,
  checkChangeRole,
  checkOwnersRemain,
  checkReviewDocument,
  isRole,
  PERMISSIONS,
  requiresMfa,
  ROLES,
} from "./permissions";

describe("role permissions", () => {
  it("gives the owner everything and the admin everything except billing", () => {
    for (const p of PERMISSIONS) {
      expect(can("owner", p)).toBe(true);
      expect(can("admin", p)).toBe(p !== "billing.manage");
    }
  });

  it("lets only owner, admin and quality manager approve suppliers", () => {
    const approvers = ROLES.filter((r) => can(r, "suppliers.approve"));
    expect(approvers).toEqual(["owner", "admin", "quality_manager"]);
  });

  it("keeps the viewer read-only", () => {
    const granted = PERMISSIONS.filter((p) => can("viewer", p));
    expect(granted).toEqual(["suppliers.view", "documents.view"]);
  });

  it("lets purchasing and warehouse upload but not review", () => {
    for (const role of ["purchasing", "warehouse"] as const) {
      expect(can(role, "documents.upload")).toBe(true);
      expect(can(role, "documents.review")).toBe(false);
      expect(can(role, "suppliers.approve")).toBe(false);
    }
  });

  it("gives every role at least read access", () => {
    for (const role of ROLES) expect(can(role, "suppliers.view")).toBe(true);
  });

  it("requires MFA for owner and admin only", () => {
    expect(ROLES.filter(requiresMfa)).toEqual(["owner", "admin"]);
  });

  it("recognizes roles", () => {
    expect(isRole("quality_manager")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("separation of duties", () => {
  const qm = { userId: "ana", role: "quality_manager" } as const;

  it("blocks reviewing your own upload", () => {
    expect(checkReviewDocument(qm, { uploadedBy: "ana" })).toBe("own_upload");
    expect(checkReviewDocument(qm, { uploadedBy: "luis" })).toBeNull();
    expect(checkReviewDocument({ userId: "w", role: "warehouse" }, { uploadedBy: "luis" })).toBe("no_permission");
  });

  it("blocks approving a supplier you added", () => {
    const company = { ownerCount: 2, allowSoleOwnerSelfApproval: true };
    expect(checkApproveParty(qm, { createdBy: "ana" }, company)).toBe("own_supplier");
    expect(checkApproveParty(qm, { createdBy: "luis" }, company)).toBeNull();
    expect(checkApproveParty({ userId: "p", role: "purchasing" }, { createdBy: "luis" }, company)).toBe(
      "no_permission",
    );
  });

  it("lets a sole owner self-approve only when the company turns it on", () => {
    const owner = { userId: "eva", role: "owner" } as const;
    expect(
      checkApproveParty(owner, { createdBy: "eva" }, { ownerCount: 1, allowSoleOwnerSelfApproval: true }),
    ).toBeNull();
    expect(checkApproveParty(owner, { createdBy: "eva" }, { ownerCount: 1, allowSoleOwnerSelfApproval: false })).toBe(
      "own_supplier",
    );
    expect(checkApproveParty(owner, { createdBy: "eva" }, { ownerCount: 2, allowSoleOwnerSelfApproval: true })).toBe(
      "own_supplier",
    );
  });

  it("always keeps an active owner", () => {
    expect(checkOwnersRemain([{ userId: "a", role: "owner", active: true }])).toBeNull();
    expect(
      checkOwnersRemain([
        { userId: "a", role: "owner", active: false },
        { userId: "b", role: "admin", active: true },
      ]),
    ).toBe("last_owner");
  });

  it("lets only an owner grant or remove the owner role", () => {
    const admin = { userId: "b", role: "admin" } as const;
    expect(checkChangeRole(admin, "staff", "quality_manager")).toBeNull();
    expect(checkChangeRole(admin, "staff", "owner")).toBe("no_permission");
    expect(checkChangeRole(admin, "owner", "admin")).toBe("no_permission");
    expect(checkChangeRole({ userId: "a", role: "owner" }, "admin", "owner")).toBeNull();
    expect(checkChangeRole(qm, "staff", "viewer")).toBe("no_permission");
  });
});

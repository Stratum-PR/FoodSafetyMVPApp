import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import type { Company } from "@/domain/company";
import { todayIn } from "@/domain/dates";
import { AppError } from "@/domain/errors";
import { type Actor, can, isRole, type Permission, type Role } from "@/domain/permissions";
import { timeZone } from "@/i18n/config";

import { getCompany, usingSampleData } from "./companies";
import { SAMPLE_USER_ID, SAMPLE_USERS, type SampleUser } from "./sample/suppliers";

/*
 * Who is asking, for which company, and on what date. Every service takes this and
 * checks permissions itself, so a screen can't forget to.
 */

export type RequestContext = {
  company: Company;
  actor: Actor;
  /** Today in the company's time zone. */
  today: string;
};

/** Sample data only: the role the sample user is previewing the app as. */
export const PREVIEW_ROLE_COOKIE = "preview_role";
export const DEFAULT_SAMPLE_ROLE: Role = "quality_manager";

/** The role the sample user is previewing as. Only meaningful while on sample data. */
export const getPreviewRole = cache(async (): Promise<Role> => {
  const value = (await cookies()).get(PREVIEW_ROLE_COOKIE)?.value;
  return isRole(value) ? value : DEFAULT_SAMPLE_ROLE;
});

/** Sample data only: which sample person is using the app (to show separation of duties). */
export const PREVIEW_USER_COOKIE = "preview_user";

export const getPreviewUser = cache(async (): Promise<SampleUser> => {
  const value = (await cookies()).get(PREVIEW_USER_COOKIE)?.value;
  return SAMPLE_USERS.find((u) => u.id === value) ?? SAMPLE_USERS.find((u) => u.id === SAMPLE_USER_ID)!;
});

/** Context for a company page or action. Throws not_found when the company isn't available. */
export const getRequestContext = cache(async (companySlug: string): Promise<RequestContext> => {
  const company = await getCompany(companySlug);
  if (!company) throw new AppError("not_found", "company");
  if (!usingSampleData) throw new Error("Sign-in is not built yet");
  return {
    company,
    actor: { userId: (await getPreviewUser()).id, role: await getPreviewRole() },
    today: todayIn(timeZone),
  };
});

export function requirePermission(ctx: RequestContext, permission: Permission): void {
  if (!can(ctx.actor.role, permission)) throw new AppError("forbidden", permission);
}

"use server";

import { cookies } from "next/headers";

import { isRole } from "@/domain/permissions";

import { usingSampleData } from "./companies";
import { PREVIEW_ROLE_COOKIE, PREVIEW_USER_COOKIE } from "./context";
import { SAMPLE_USERS } from "./sample/suppliers";

/**
 * Sample data only: shows the app as another role would see it, so prospects can try
 * each role. Real accounts get their role from the company's user list, never a cookie.
 */
export async function setPreviewRole(role: string): Promise<void> {
  if (!usingSampleData || !isRole(role)) return;
  (await cookies()).set(PREVIEW_ROLE_COOKIE, role, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Sample data only: act as another sample person, e.g. to review a document you uploaded as someone else. */
export async function setPreviewUser(userId: string): Promise<void> {
  if (!usingSampleData || !SAMPLE_USERS.some((u) => u.id === userId)) return;
  (await cookies()).set(PREVIEW_USER_COOKIE, userId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

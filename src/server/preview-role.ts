"use server";

import { cookies } from "next/headers";

import { isRole } from "@/domain/permissions";

import { usingSampleData } from "./companies";
import { PREVIEW_ROLE_COOKIE } from "./context";

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

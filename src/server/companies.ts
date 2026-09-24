import "server-only";

import { type Company, isValidCompanySlug } from "@/domain/company";

import { SAMPLE_COMPANIES } from "./sample/companies";

/*
 * Company service. Screens call these functions and nothing else; today they return
 * sample data, later they query Postgres with the signed-in user's permissions
 * (withTenant + row-level security). The signatures stay the same.
 */

/** Whether the app is running on fictional sample data (shown as a badge in the UI). */
export const usingSampleData = true;

/** Companies the current user can open. */
export async function listCompanies(): Promise<Company[]> {
  return SAMPLE_COMPANIES;
}

/** One company by its URL slug, or null if it doesn't exist or the user can't open it. */
export async function getCompany(slug: string): Promise<Company | null> {
  if (!isValidCompanySlug(slug)) return null;
  return SAMPLE_COMPANIES.find((c) => c.slug === slug) ?? null;
}

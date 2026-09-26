import type { ActivityEvent } from "@/domain/activity";
import type { IsoDate } from "@/domain/dates";
import { DEFAULT_REVIEW_POLICY, type ReviewPolicy } from "@/domain/permissions";
import { DEFAULT_REQUIREMENT_POLICY, type RequirementPolicy } from "@/domain/programs";
import { DEFAULT_RISK_POLICY, type RiskPolicy } from "@/domain/risk";

import { generateSampleSuppliers, type SampleSupplierData } from "./suppliers";

/*
 * In-memory sample data that actions can change (accept, reject, …) while the app runs.
 * It resets when the server restarts or the day changes, which is fine for demos; the
 * database replaces this later without changing the services' signatures.
 * Kept on globalThis so development hot-reloads don't wipe it.
 */

export type SampleStore = SampleSupplierData & {
  events: ActivityEvent[];
  /** The company's separation-of-duties choice (Ajustes). Off by default. */
  policy: ReviewPolicy;
  /** Which requirements block a full approval (Ajustes). */
  requirementPolicy: RequirementPolicy;
  /** How factors suggest a supplier risk rating (Ajustes). Versioned. */
  riskPolicy: RiskPolicy;
};

// The key carries the data shape's version, so a running dev server never serves stores built
// with an older shape after a hot reload.
const globalStores = globalThis as unknown as { __stratumSampleStoresV2?: Map<string, SampleStore> };
const stores = (globalStores.__stratumSampleStoresV2 ??= new Map<string, SampleStore>());

export function getSampleStore(companySlug: string, today: IsoDate): SampleStore {
  const key = `${companySlug}|${today}`;
  let store = stores.get(key);
  if (!store) {
    // A new day starts from fresh data; drop the company's older days.
    for (const k of stores.keys()) if (k.startsWith(`${companySlug}|`)) stores.delete(k);
    store = {
      ...generateSampleSuppliers(companySlug, today),
      events: [],
      policy: { ...DEFAULT_REVIEW_POLICY },
      requirementPolicy: { blocking: { ...DEFAULT_REQUIREMENT_POLICY.blocking } },
      riskPolicy: { ...DEFAULT_RISK_POLICY },
    };
    stores.set(key, store);
  }
  return store;
}

/** Back to the generated data (tests, and a future "reset sample data" button). */
export function resetSampleStore(companySlug?: string): void {
  for (const k of [...stores.keys()]) if (!companySlug || k.startsWith(`${companySlug}|`)) stores.delete(k);
}

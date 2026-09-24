import type { ActivityEvent } from "@/domain/activity";
import type { IsoDate } from "@/domain/dates";

import { generateSampleSuppliers, type SampleSupplierData } from "./suppliers";

/*
 * In-memory sample data that actions can change (accept, reject, …) while the app runs.
 * It resets when the server restarts or the day changes, which is fine for demos; the
 * database replaces this later without changing the services' signatures.
 * Kept on globalThis so development hot-reloads don't wipe it.
 */

export type SampleStore = SampleSupplierData & { events: ActivityEvent[] };

const globalStores = globalThis as unknown as { __stratumSampleStores?: Map<string, SampleStore> };
const stores = (globalStores.__stratumSampleStores ??= new Map<string, SampleStore>());

export function getSampleStore(companySlug: string, today: IsoDate): SampleStore {
  const key = `${companySlug}|${today}`;
  let store = stores.get(key);
  if (!store) {
    // A new day starts from fresh data; drop the company's older days.
    for (const k of stores.keys()) if (k.startsWith(`${companySlug}|`)) stores.delete(k);
    store = { ...generateSampleSuppliers(companySlug, today), events: [] };
    stores.set(key, store);
  }
  return store;
}

/** Back to the generated data (tests, and a future "reset sample data" button). */
export function resetSampleStore(companySlug?: string): void {
  for (const k of [...stores.keys()]) if (!companySlug || k.startsWith(`${companySlug}|`)) stores.delete(k);
}

import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { SAMPLE_COMPANIES } = await import("./sample/companies");
const { getSampleStore, resetSampleStore } = await import("./sample/store");
const { createSupplier, getSupplier, getPanelSummary, listSuppliers } = await import("./suppliers");
const { filterSuppliers, parseFilters, supplierStats } = await import("./supplier-filters");
const ctx = {
  company: SAMPLE_COMPANIES[0],
  actor: { userId: "u-sample", role: "quality_manager" as const },
  today: "2026-09-26",
};

beforeEach(() => resetSampleStore());

it("creates a supplier and its site in only the requested company", async () => {
  const input = {
    name: "Molinos de Prueba Integración",
    type: "manufacturer",
    city: "Caguas",
    country: "PR",
    fei: "3012345678",
  };
  const outcome = await createSupplier(ctx, input);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error("creation failed");
  const detail = await getSupplier(ctx, outcome.id);
  expect(detail?.party).toMatchObject({ direction: "request", approval: "pending", lifecycle: "onboarding" });
  expect(getSampleStore(ctx.company.slug, ctx.today).sites.find((s) => s.partyId === outcome.id)).toMatchObject({
    city: "Caguas",
    fei: input.fei,
  });
  expect(await getSupplier({ ...ctx, company: SAMPLE_COMPANIES[1] }, outcome.id)).toBeNull();
  expect((await createSupplier(ctx, input)).ok).toBe(false);
  await expect(
    createSupplier({ ...ctx, actor: { ...ctx.actor, role: "viewer" } }, { ...input, name: "Otro Suplidor de Prueba" }),
  ).rejects.toThrow();
});

it("keeps dashboard, summary cards and active filter counts aligned", async () => {
  const rows = await listSuppliers(ctx);
  const panel = await getPanelSummary(ctx);
  expect(panel.suppliers.active).toBe(supplierStats(rows).active);
  expect(filterSuppliers(rows, parseFilters({ estado: "active" }))).toHaveLength(panel.suppliers.active);
  expect(panel.operations.fdaRenewal.due.length).toBeGreaterThan(0);
});

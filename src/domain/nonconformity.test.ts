import { describe, expect, it } from "vitest";

import { checkNonconformity } from "./nonconformity";

const TODAY = "2026-09-24";
const input = { date: "2026-09-20", severity: "major", description: "Lote recibido sin COA", lotCode: " L123 " };

describe("nonconformities", () => {
  it("accepts a valid record, trimmed", () => {
    expect(checkNonconformity(input, TODAY)).toEqual({
      ok: true,
      value: { date: "2026-09-20", severity: "major", description: "Lote recibido sin COA", lotCode: "L123" },
    });
  });

  it("checks every field", () => {
    expect(checkNonconformity({ date: "", severity: "", description: "", lotCode: "" }, TODAY)).toEqual({
      ok: false,
      errors: { date: "required", severity: "required", description: "required" },
    });
    expect(
      checkNonconformity({ ...input, date: "2026-10-01", severity: "catastrophic", description: "mal" }, TODAY),
    ).toEqual({ ok: false, errors: { date: "future_date", severity: "invalid", description: "too_short" } });
    expect(checkNonconformity({ ...input, lotCode: "x".repeat(41) }, TODAY)).toMatchObject({
      errors: { lotCode: "too_long" },
    });
  });
});

import { describe, expect, it } from "vitest";

import { checkNewSupplier, type NewSupplierInput, sameName } from "./new-supplier";

const input = (extra: Partial<NewSupplierInput> = {}): NewSupplierInput => ({
  name: "Harinas del Valle Inc.",
  type: "manufacturer",
  city: "Caguas",
  country: "PR",
  fei: "",
  ...extra,
});

describe("new supplier", () => {
  it("accepts a complete supplier and tidies the text", () => {
    expect(
      checkNewSupplier(input({ name: "  Harinas   del Valle Inc. ", country: "pr", fei: " 3012 345 678 " }), []),
    ).toEqual({
      ok: true,
      value: { name: "Harinas del Valle Inc.", type: "manufacturer", city: "Caguas", country: "PR", fei: "3012345678" },
    });
  });

  it("leaves the FEI out when it's blank", () => {
    const check = checkNewSupplier(input(), []);
    expect(check.ok && check.value.fei).toBeUndefined();
  });

  it("explains every problem at once", () => {
    expect(checkNewSupplier({ name: "", type: "", city: " ", country: "", fei: "" }, [])).toEqual({
      ok: false,
      errors: { name: "required", type: "required", city: "required", country: "required" },
    });
    expect(
      checkNewSupplier(input({ name: "A", type: "broker", city: "x".repeat(81), country: "PRI", fei: "12AB" }), []),
    ).toEqual({
      ok: false,
      errors: { name: "too_short", type: "invalid", city: "too_long", country: "invalid", fei: "invalid" },
    });
    expect(checkNewSupplier(input({ name: "x".repeat(121) }), [])).toMatchObject({ errors: { name: "too_long" } });
  });

  it("refuses a name already on the list, ignoring accents, case and punctuation", () => {
    expect(sameName("Cintrón, Inc.", "cintron inc")).toBe(true);
    expect(sameName("Cintrón Inc.", "Cintrón Foods Inc.")).toBe(false);
    expect(checkNewSupplier(input({ name: "HARINAS DEL VALLE, INC" }), ["Harinas del Valle Inc."])).toMatchObject({
      ok: false,
      errors: { name: "duplicate" },
    });
  });
});

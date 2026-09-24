import { describe, expect, it } from "vitest";

import { isValidCompanySlug } from "./company";

describe("isValidCompanySlug", () => {
  it("accepts lowercase words separated by single hyphens", () => {
    expect(isValidCompanySlug("alimentos-cordillera")).toBe(true);
    expect(isValidCompanySlug("abc")).toBe(true);
  });

  it("rejects anything that could be a path trick or a typo", () => {
    for (const bad of ["", "ab", "Alimentos", "a--b", "-abc", "abc-", "a/b", "a.b", "a_b", "x".repeat(49)]) {
      expect(isValidCompanySlug(bad)).toBe(false);
    }
  });
});

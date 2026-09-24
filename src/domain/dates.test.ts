import { describe, expect, it } from "vitest";

import { addDays, addMonths, daysBetween, isIsoDate, todayIn } from "./dates";

describe("dates", () => {
  it("adds months and clamps to the month's end", () => {
    expect(addMonths("2026-03-15", 12)).toBe("2027-03-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("adds days and counts days between", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-09-24", "2026-10-24")).toBe(30);
    expect(daysBetween("2026-09-24", "2026-09-20")).toBe(-4);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate(20260228)).toBe(false);
    expect(() => addDays("nope", 1)).toThrow();
  });

  it("gives today's date in Puerto Rico", () => {
    // 02:00 UTC is still the previous evening in Puerto Rico (UTC-4).
    expect(todayIn("America/Puerto_Rico", new Date("2026-09-25T02:00:00Z"))).toBe("2026-09-24");
  });
});

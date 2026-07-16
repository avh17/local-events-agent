import { describe, it, expect } from "vitest";
import { assessBudget } from "../lib/budget";

// v1 budget policy (user-confirmed): soft filter on minimum known price.
// - Within cap: include, no note.
// - Up to 25% over cap: include, flagged as over budget.
// - More than 25% over cap: exclude.
// - Unknown price: include, flagged as unlisted (never silently hidden).
// - No cap set: everything included; unknown prices still flagged.
describe("assessBudget", () => {
  it("includes events at or under the cap with no note", () => {
    expect(assessBudget(30, 50)).toEqual({ include: true });
    expect(assessBudget(50, 50)).toEqual({ include: true });
    expect(assessBudget(0, 50)).toEqual({ include: true });
  });

  it("includes slightly-over-budget events (<= 1.25x cap) with an over-budget note", () => {
    const v = assessBudget(55, 50);
    expect(v.include).toBe(true);
    expect(v.note).toBeDefined();
    expect(v.note!.toLowerCase()).toContain("over");
    expect(v.note).toContain("$50");
  });

  it("excludes events far over the cap (> 1.25x cap)", () => {
    expect(assessBudget(70, 50).include).toBe(false);
    expect(assessBudget(1000, 50).include).toBe(false);
  });

  it("includes unknown-price events with an 'unlisted' note", () => {
    for (const price of [undefined, null]) {
      const v = assessBudget(price, 50);
      expect(v.include).toBe(true);
      expect(v.note!.toLowerCase()).toContain("unlisted");
    }
  });

  it("includes everything when no cap is set", () => {
    expect(assessBudget(500, null)).toEqual({ include: true });
    expect(assessBudget(500, undefined)).toEqual({ include: true });
    const unknown = assessBudget(undefined, null);
    expect(unknown.include).toBe(true);
    expect(unknown.note!.toLowerCase()).toContain("unlisted");
  });
});

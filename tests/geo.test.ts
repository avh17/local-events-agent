import { describe, it, expect } from "vitest";
import { haversineMiles } from "../lib/geo";

describe("haversineMiles", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMiles(33.4255, -111.94, 33.4255, -111.94)).toBe(0);
  });

  it("computes NYC -> LA at roughly 2445 miles", () => {
    const d = haversineMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2415);
    expect(d).toBeLessThan(2475);
  });

  it("computes Tempe -> downtown Phoenix at roughly 8 miles", () => {
    const d = haversineMiles(33.4255, -111.94, 33.4484, -112.074);
    expect(d).toBeGreaterThan(7);
    expect(d).toBeLessThan(9);
  });
});

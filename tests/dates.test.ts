import { describe, it, expect } from "vitest";
import { upcomingWeekend, toTicketmasterDateTime } from "../lib/dates";

// Weekend semantics (UTC-based to stay deterministic): Friday 00:00:00 UTC
// through Sunday 23:59:59 UTC. Mid-week dates target the coming weekend;
// Fri/Sat/Sun dates target the weekend already in progress.
describe("upcomingWeekend", () => {
  it("targets the coming weekend from a Wednesday", () => {
    const wed = new Date(Date.UTC(2026, 6, 15)); // Wed 2026-07-15
    const { start, end } = upcomingWeekend(wed);
    expect(start.toISOString()).toBe("2026-07-17T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-19T23:59:59.000Z");
  });

  it("targets the current weekend from a Saturday", () => {
    const sat = new Date(Date.UTC(2026, 6, 18)); // Sat 2026-07-18
    const { start, end } = upcomingWeekend(sat);
    expect(start.toISOString()).toBe("2026-07-17T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-19T23:59:59.000Z");
  });

  it("targets the current weekend from a Friday", () => {
    const fri = new Date(Date.UTC(2026, 6, 17));
    const { start } = upcomingWeekend(fri);
    expect(start.toISOString()).toBe("2026-07-17T00:00:00.000Z");
  });

  it("targets next weekend from a Monday", () => {
    const mon = new Date(Date.UTC(2026, 6, 20)); // Mon 2026-07-20
    const { start } = upcomingWeekend(mon);
    expect(start.toISOString()).toBe("2026-07-24T00:00:00.000Z");
  });
});

describe("toTicketmasterDateTime", () => {
  it("formats as UTC ISO without milliseconds (TM rejects ms)", () => {
    const d = new Date(Date.UTC(2026, 6, 17, 0, 0, 0));
    expect(toTicketmasterDateTime(d)).toBe("2026-07-17T00:00:00Z");
  });

  it("formats a non-midnight time", () => {
    const d = new Date(Date.UTC(2026, 11, 3, 18, 30, 5));
    expect(toTicketmasterDateTime(d)).toBe("2026-12-03T18:30:05Z");
  });
});

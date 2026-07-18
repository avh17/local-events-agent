import { describe, expect, it } from "vitest";
import { displayBudgetNote, isTicketmasterUrl } from "../lib/booking";

describe("isTicketmasterUrl", () => {
  it("recognizes Ticketmaster event links", () => {
    expect(isTicketmasterUrl("https://www.ticketmaster.com/event/123")).toBe(true);
    expect(isTicketmasterUrl("https://ticketmaster.com/event/123")).toBe(true);
  });

  it("does not mistake other or malformed URLs for Ticketmaster", () => {
    expect(isTicketmasterUrl("https://ticketmaster.com.example.com/event/123")).toBe(false);
    expect(isTicketmasterUrl("https://www.ticketweb.com/event/123")).toBe(false);
    expect(isTicketmasterUrl("not a URL")).toBe(false);
  });
});

describe("displayBudgetNote", () => {
  it("updates legacy saved-card wording that implied tickets had no price", () => {
    const note = displayBudgetNote("price unlisted — check the listing before you go");
    expect(note).toContain("event feed");
    expect(note).toContain("live listing");
    expect(note).not.toContain("unlisted");
  });

  it("preserves other budget warnings", () => {
    expect(displayBudgetNote("a bit over your $40 cap (from $45)")).toBe(
      "a bit over your $40 cap (from $45)",
    );
  });
});

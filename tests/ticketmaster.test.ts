import { describe, it, expect, vi } from "vitest";
import { buildSearchUrl, mapEvents, searchTicketmaster } from "../lib/ticketmaster";

const fixture = {
  _embedded: {
    events: [
      {
        id: "ev-full",
        name: "Jazz Night at the Van Buren",
        url: "https://www.ticketmaster.com/event/ev-full",
        dates: { start: { dateTime: "2026-07-18T02:00:00Z", localDate: "2026-07-17" } },
        classifications: [{ segment: { name: "Music" } }],
        priceRanges: [{ min: 35, max: 85, currency: "USD" }],
        images: [
          { url: "https://img.tm.com/small.jpg", width: 100, height: 56 },
          { url: "https://img.tm.com/big.jpg", width: 1024, height: 576 },
        ],
        _embedded: {
          venues: [
            {
              name: "The Van Buren",
              city: { name: "Phoenix" },
              state: { stateCode: "AZ" },
              location: { latitude: "33.4484", longitude: "-112.0740" },
            },
          ],
        },
      },
      {
        // minimal event: no prices, no venue location, no images
        id: "ev-min",
        name: "Community Poetry Slam",
        url: "https://www.ticketmaster.com/event/ev-min",
        dates: { start: { localDate: "2026-07-18" } },
        _embedded: { venues: [{ name: "Local Hall", city: { name: "Mesa" } }] },
      },
    ],
  },
};

describe("buildSearchUrl", () => {
  it("includes api key, geo point, radius in miles, and dates", () => {
    const url = buildSearchUrl(
      {
        lat: 33.4255,
        lng: -111.94,
        radiusMiles: 25,
        keyword: "jazz night",
        startDateTime: "2026-07-17T00:00:00Z",
        endDateTime: "2026-07-19T23:59:59Z",
      },
      "TESTKEY",
    );
    expect(url).toContain("app.ticketmaster.com/discovery/v2/events.json");
    expect(url).toContain("apikey=TESTKEY");
    expect(url).toContain("latlong=33.4255%2C-111.94");
    expect(url).toContain("radius=25");
    expect(url).toContain("unit=miles");
    expect(url).toContain("keyword=jazz");
    expect(url).toContain("startDateTime=2026-07-17T00%3A00%3A00Z");
    expect(url).toContain("endDateTime=");
  });

  it("passes city and classification when no coordinates are given", () => {
    const url = buildSearchUrl({ city: "Austin", category: "Music" }, "K");
    expect(url).toContain("city=Austin");
    expect(url).toContain("classificationName=Music");
    expect(url).not.toContain("latlong");
  });
});

describe("mapEvents", () => {
  it("maps a full event with prices, venue coords, and the largest image", () => {
    const [ev] = mapEvents(fixture);
    expect(ev).toMatchObject({
      id: "ev-full",
      name: "Jazz Night at the Van Buren",
      url: "https://www.ticketmaster.com/event/ev-full",
      venue: "The Van Buren",
      city: "Phoenix",
      state: "AZ",
      lat: 33.4484,
      lng: -112.074,
      priceMin: 35,
      priceMax: 85,
      category: "Music",
    });
    expect(ev.imageUrl).toBe("https://img.tm.com/big.jpg");
    expect(ev.date).toBe("2026-07-18T02:00:00Z");
  });

  it("maps a minimal event without throwing, leaving optional fields undefined", () => {
    const events = mapEvents(fixture);
    const min = events.find((e) => e.id === "ev-min")!;
    expect(min.priceMin).toBeUndefined();
    expect(min.lat).toBeUndefined();
    expect(min.imageUrl).toBeUndefined();
    expect(min.city).toBe("Mesa");
    expect(min.date).toBe("2026-07-18");
  });

  it("returns [] for an empty response", () => {
    expect(mapEvents({})).toEqual([]);
    expect(mapEvents({ page: { totalElements: 0 } })).toEqual([]);
  });
});

describe("searchTicketmaster", () => {
  it("fetches with the built URL and returns mapped events", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => fixture,
    })) as unknown as typeof fetch;

    const events = await searchTicketmaster(
      { keyword: "jazz" },
      { apiKey: "TESTKEY", fetchFn },
    );
    expect(events).toHaveLength(2);
    const calledUrl = (fetchFn as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain("apikey=TESTKEY");
  });

  it("throws a descriptive error on a non-OK response", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "bad key",
    })) as unknown as typeof fetch;

    await expect(
      searchTicketmaster({ keyword: "jazz" }, { apiKey: "BAD", fetchFn }),
    ).rejects.toThrow(/Ticketmaster/);
  });
});

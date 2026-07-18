import { describe, it, expect, vi } from "vitest";
import { toolDefinitions, executeTool, type ToolContext } from "../lib/agent/tools";
import type { Profile } from "../lib/types";
import type { TMEvent } from "../lib/ticketmaster";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    email: "test@example.com",
    home_base_text: "Tempe, AZ",
    home_lat: 33.4255,
    home_lng: -111.94,
    budget_cap: 40,
    max_distance_miles: 20,
    taste: { likes: ["indie rock"], dislikes: [], vibes: [], notes: [] },
    digest_opt_in: true,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    profile: makeProfile(),
    saveProfile: vi.fn(async (patch) => ({ ...makeProfile(), ...patch }) as Profile),
    ...overrides,
  };
}

const nearCheap: TMEvent = {
  id: "near-cheap",
  name: "Indie Night",
  url: "https://tm.example/near-cheap",
  date: "2026-07-18T02:00:00Z",
  venue: "The Van Buren",
  city: "Phoenix",
  lat: 33.4484,
  lng: -112.074,
  priceMin: 20,
  priceMax: 45,
};

const farAway: TMEvent = {
  id: "far-away",
  name: "LA Stadium Show",
  url: "https://tm.example/far",
  date: "2026-07-18T02:00:00Z",
  venue: "SoFi",
  city: "Los Angeles",
  lat: 34.0522,
  lng: -118.2437,
  priceMin: 20,
};

const nearExpensive: TMEvent = {
  id: "near-expensive",
  name: "Gala Concert",
  url: "https://tm.example/expensive",
  date: "2026-07-18T02:00:00Z",
  venue: "Symphony Hall",
  city: "Phoenix",
  lat: 33.4484,
  lng: -112.074,
  priceMin: 100,
};

const nearUnknownPrice: TMEvent = {
  id: "near-unknown",
  name: "Warehouse Art Pop-up",
  url: "https://tm.example/unknown",
  date: "2026-07-18T02:00:00Z",
  venue: "Warehouse District",
  city: "Phoenix",
  lat: 33.4484,
  lng: -112.074,
};

describe("toolDefinitions", () => {
  it("defines search_events, update_profile, and present_events with schemas", () => {
    const names = toolDefinitions.map((t) => t.name);
    expect(names).toContain("search_events");
    expect(names).toContain("update_profile");
    expect(names).toContain("present_events");
    for (const tool of toolDefinitions) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect((tool.input_schema as any).type).toBe("object");
    }
  });

  it("asks the model for short, grounded card reasons", () => {
    const presentEvents = toolDefinitions.find((tool) => tool.name === "present_events");
    const reason = (presentEvents?.input_schema as any).properties.events.items.properties.reason;
    expect(reason.description).toContain("35 words max");
    expect(reason.description).toContain("specific user taste");
    expect(reason.description).toContain("Avoid generic praise");
  });
});

describe("executeTool: search_events", () => {
  it("searches from the saved home base and applies distance + budget filters", async () => {
    const searchFn = vi.fn(async () => [nearCheap, farAway, nearExpensive, nearUnknownPrice]);
    const ctx = makeCtx({ searchFn });

    const outcome = await executeTool("search_events", { use_home_base: true }, ctx);
    expect(outcome.isError).toBeFalsy();

    // Search was anchored to the profile's home coordinates
    const params = (searchFn as any).mock.calls[0][0];
    expect(params.lat).toBeCloseTo(33.4255);
    expect(params.lng).toBeCloseTo(-111.94);

    const payload = JSON.parse(outcome.result);
    const ids = payload.events.map((e: any) => e.id);

    expect(ids).toContain("near-cheap"); // in range, in budget
    expect(ids).toContain("near-unknown"); // unknown price kept, flagged
    expect(ids).not.toContain("far-away"); // ~370 mi, beyond 20 mi max
    expect(ids).not.toContain("near-expensive"); // $100 min vs $40 cap (>1.25x)

    const cheap = payload.events.find((e: any) => e.id === "near-cheap");
    expect(cheap.distance_miles).toBeGreaterThan(7);
    expect(cheap.distance_miles).toBeLessThan(9);
    expect(cheap.budget_note).toBeUndefined();

    const unknown = payload.events.find((e: any) => e.id === "near-unknown");
    expect(unknown.budget_note.toLowerCase()).toContain("event feed");
  });

  it("reports filtered-out counts so the model can be transparent", async () => {
    const searchFn = vi.fn(async () => [nearCheap, farAway, nearExpensive]);
    const outcome = await executeTool("search_events", { use_home_base: true }, makeCtx({ searchFn }));
    const payload = JSON.parse(outcome.result);
    expect(payload.excluded_over_budget).toBe(1);
    expect(payload.excluded_too_far).toBe(1);
  });

  it("replaces the saved home base when an explicit location is searched", async () => {
    const sanJoseEvent: TMEvent = {
      ...nearCheap,
      id: "san-jose-show",
      name: "San Jose Jazz Night",
      city: "San Jose",
      lat: 37.335,
      lng: -121.89,
    };
    const searchFn = vi.fn(async () => [sanJoseEvent]);
    const geocodeFn = vi.fn(async () => ({
      lat: 37.3382,
      lng: -121.8863,
      display: "San Jose, Santa Clara County, California, USA",
    }));
    const saveProfile = vi.fn(async (patch: Partial<Profile>) => ({
      ...makeProfile(),
      ...patch,
    }));
    const ctx = makeCtx({ searchFn, geocodeFn, saveProfile });

    const outcome = await executeTool(
      "search_events",
      { city: "San Jose, CA", use_home_base: true, radius_miles: 10 },
      ctx,
    );

    expect(outcome.isError).toBeFalsy();
    expect(geocodeFn).toHaveBeenCalledWith("San Jose, CA");
    expect(saveProfile).toHaveBeenCalledWith({
      home_base_text: "San Jose, CA",
      home_lat: 37.3382,
      home_lng: -121.8863,
    });

    const params = (searchFn as any).mock.calls[0][0];
    expect(params.city).toBeUndefined();
    expect(params.lat).toBeCloseTo(37.3382);
    expect(params.lng).toBeCloseTo(-121.8863);

    const payload = JSON.parse(outcome.result);
    expect(payload.home_base_updated).toBe("San Jose, CA");
    expect(payload.excluded_too_far).toBe(0);
    expect(payload.events[0].id).toBe("san-jose-show");
    expect(payload.events[0].distance_miles).toBeLessThan(1);
    expect(ctx.profile.home_base_text).toBe("San Jose, CA");
  });

  it("does not replace the home base when an explicit location cannot be geocoded", async () => {
    const saveProfile = vi.fn(async (patch: Partial<Profile>) => ({
      ...makeProfile(),
      ...patch,
    }));
    const outcome = await executeTool(
      "search_events",
      { city: "not-a-real-place", use_home_base: true },
      makeCtx({
        geocodeFn: vi.fn(async () => null),
        searchFn: vi.fn(async () => []),
        saveProfile,
      }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.result).toContain("not-a-real-place");
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("errors gracefully when asked to use home base but none is saved", async () => {
    const ctx = makeCtx({
      profile: makeProfile({ home_lat: null, home_lng: null, home_base_text: null }),
      searchFn: vi.fn(async () => []),
    });
    const outcome = await executeTool("search_events", { use_home_base: true }, ctx);
    expect(outcome.isError).toBe(true);
    expect(outcome.result.toLowerCase()).toContain("home base");
  });
});

describe("executeTool: update_profile", () => {
  it("geocodes a new home base and saves coordinates", async () => {
    const geocodeFn = vi.fn(async () => ({ lat: 33.4255, lng: -111.94, display: "Tempe, AZ, USA" }));
    const saveProfile = vi.fn(async (patch: Partial<Profile>) => ({ ...makeProfile(), ...patch }) as Profile);
    const ctx = makeCtx({ geocodeFn, saveProfile });

    const outcome = await executeTool(
      "update_profile",
      { home_base: "Tempe, AZ", budget_cap: 60, max_distance_miles: 25 },
      ctx,
    );

    expect(geocodeFn).toHaveBeenCalledWith("Tempe, AZ");
    const patch = saveProfile.mock.calls[0][0];
    expect(patch.home_base_text).toBe("Tempe, AZ");
    expect(patch.home_lat).toBeCloseTo(33.4255);
    expect(patch.home_lng).toBeCloseTo(-111.94);
    expect(patch.budget_cap).toBe(60);
    expect(patch.max_distance_miles).toBe(25);
    expect(outcome.result).toContain("Tempe");
    expect(outcome.isError).toBeFalsy();
  });

  it("merges taste additions without duplicates", async () => {
    const saveProfile = vi.fn(async (patch: Partial<Profile>) => ({ ...makeProfile(), ...patch }) as Profile);
    const ctx = makeCtx({ saveProfile });

    await executeTool("update_profile", { add_likes: ["jazz", "indie rock"], add_dislikes: ["EDM"] }, ctx);

    const patch = saveProfile.mock.calls[0][0];
    expect(patch.taste!.likes).toContain("jazz");
    expect(patch.taste!.likes).toContain("indie rock");
    expect(patch.taste!.likes.filter((l: string) => l === "indie rock")).toHaveLength(1);
    expect(patch.taste!.dislikes).toContain("EDM");
  });

  it("errors gracefully when the home base cannot be geocoded", async () => {
    const geocodeFn = vi.fn(async () => null);
    const outcome = await executeTool("update_profile", { home_base: "zzz-nowhere" }, makeCtx({ geocodeFn }));
    expect(outcome.isError).toBe(true);
  });
});

describe("executeTool: present_events", () => {
  it("passes cards through for the UI and tells the model not to repeat them", async () => {
    const card = {
      id: "near-cheap",
      name: "Indie Night",
      url: "https://tm.example/near-cheap",
      date: "Fri Jul 17, 7:00 PM",
      venue: "The Van Buren",
      city: "Phoenix",
      reason: "You loved indie rock shows",
    };
    const outcome = await executeTool("present_events", { intro: "Found these:", events: [card] }, makeCtx());
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events![0].name).toBe("Indie Night");
    expect(outcome.result).toContain("Presented");
  });
});

describe("executeTool: unknown tool", () => {
  it("returns an error outcome instead of throwing", async () => {
    const outcome = await executeTool("no_such_tool", {}, makeCtx());
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toContain("Unknown tool");
  });
});

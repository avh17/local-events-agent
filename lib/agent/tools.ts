import type { AgentTool } from "../bedrock";
import { assessBudget } from "../budget";
import { haversineMiles } from "../geo";
import { geocode, type GeocodeResult } from "../geocode";
import { searchTicketmaster, type TMEvent, type TMSearchParams } from "../ticketmaster";
import { EMPTY_TASTE, type EventCard, type FeedbackRow, type Profile } from "../types";

export interface ToolContext {
  profile: Profile;
  recentFeedback?: FeedbackRow[];
  saveProfile: (patch: Partial<Profile>) => Promise<Profile>;
  /** Injectable for tests; defaults to the live Ticketmaster client. */
  searchFn?: (params: TMSearchParams) => Promise<TMEvent[]>;
  /** Injectable for tests; defaults to Nominatim. */
  geocodeFn?: (query: string) => Promise<GeocodeResult | null>;
}

export interface ToolOutcome {
  result: string;
  events?: EventCard[];
  isError?: boolean;
}

export const toolDefinitions: AgentTool[] = [
  {
    name: "search_events",
    description:
      "Search live event listings (Ticketmaster Discovery). Returns candidate events already filtered by the user's saved max distance and budget cap, with per-event straight-line distance from their home base and budget labels. An explicit city or location replaces the saved home base and always takes precedence over use_home_base.",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Free-text search, e.g. artist, genre, event name" },
        category: {
          type: "string",
          description: "Ticketmaster segment name: Music, Sports, Arts & Theatre, Film, Miscellaneous",
        },
        city: {
          type: "string",
          description: "New city, ZIP code, or neighborhood to search; replaces the saved home base",
        },
        use_home_base: {
          type: "boolean",
          description: "Anchor the search to the user's saved home base coordinates",
        },
        radius_miles: { type: "number", description: "Search radius; defaults to the user's max distance" },
        start_date: { type: "string", description: "Earliest event date, YYYY-MM-DD" },
        end_date: { type: "string", description: "Latest event date, YYYY-MM-DD" },
        max_results: { type: "number", description: "Cap on returned events (default 25)" },
      },
    },
  },
  {
    name: "update_profile",
    description:
      "Save or update the user's profile: home base (geocoded automatically), budget cap in USD, max distance in miles, taste additions (likes/dislikes/vibes/notes), and weekly digest opt-in. Call this as soon as the user shares any of these. Do not batch them up.",
    input_schema: {
      type: "object",
      properties: {
        home_base: { type: "string", description: "Home location as free text, e.g. 'Tempe, AZ'" },
        budget_cap: { type: "number", description: "Max ticket price in USD the user wants to pay" },
        max_distance_miles: { type: "number", description: "How far the user is willing to travel" },
        add_likes: { type: "array", items: { type: "string" }, description: "Genres/activities the user enjoys" },
        add_dislikes: { type: "array", items: { type: "string" }, description: "Things to avoid recommending" },
        add_vibes: { type: "array", items: { type: "string" }, description: "Preferred vibes, e.g. 'intimate venues'" },
        add_notes: { type: "array", items: { type: "string" }, description: "Other useful context about the user" },
        digest_opt_in: { type: "boolean", description: "Whether to send the weekly email digest" },
      },
    },
  },
  {
    name: "present_events",
    description:
      "Show curated event picks as rich cards with booking links. Never paste event lists into prose. Each card needs a short, natural 'reason' grounded in the user's tastes and the listing, plus a 'budget_note' when the event feed did not supply a price or the price is over their cap.",
    input_schema: {
      type: "object",
      properties: {
        intro: { type: "string", description: "One-line lead-in shown above the cards" },
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              url: { type: "string", description: "Booking deep link (vendor checkout page)" },
              date: { type: "string", description: "Human-readable date/time, e.g. 'Fri Jul 17, 7:00 PM'" },
              venue: { type: "string" },
              city: { type: "string" },
              image_url: { type: "string" },
              price_min: { type: "number" },
              price_max: { type: "number" },
              distance_miles: { type: "number" },
              reason: {
                type: "string",
                description:
                  "One or two natural sentences (35 words max) connecting a specific user taste or past reaction to a detail in this listing. Sound like a friend making the case. Avoid generic praise, promotional language, and invented details.",
              },
              budget_note: { type: "string", description: "Transparency label for price caveats" },
            },
            required: ["id", "name", "url", "date", "venue", "city", "reason"],
          },
        },
      },
      required: ["events"],
    },
  },
];

/* eslint-disable @typescript-eslint/no-explicit-any */

async function searchEvents(input: any, ctx: ToolContext): Promise<ToolOutcome> {
  let p = ctx.profile;
  let lat: number | undefined;
  let lng: number | undefined;
  const explicitLocation =
    typeof input?.city === "string" && input.city.trim().length > 0
      ? input.city.trim()
      : undefined;

  if (explicitLocation) {
    const geocodeLocation = ctx.geocodeFn ?? geocode;
    const loc = await geocodeLocation(explicitLocation);
    if (!loc) {
      return {
        result: `Could not find "${explicitLocation}" on the map. Ask the user to clarify the city, state, or ZIP code.`,
        isError: true,
      };
    }
    p = await ctx.saveProfile({
      home_base_text: explicitLocation,
      home_lat: loc.lat,
      home_lng: loc.lng,
    });
    ctx.profile = p;
    lat = loc.lat;
    lng = loc.lng;
  } else if (input?.use_home_base) {
    if (p.home_lat == null || p.home_lng == null) {
      return {
        result:
          "No home base is saved yet. Ask the user where they're based (city or address), save it with update_profile, then search again.",
        isError: true,
      };
    }
    lat = p.home_lat;
    lng = p.home_lng;
  }

  const search = ctx.searchFn ?? ((params: TMSearchParams) => searchTicketmaster(params));
  const found = await search({
    keyword: input?.keyword,
    category: input?.category,
    city: undefined,
    lat,
    lng,
    radiusMiles: input?.radius_miles ?? p.max_distance_miles ?? 30,
    startDateTime: input?.start_date ? `${input.start_date}T00:00:00Z` : undefined,
    endDateTime: input?.end_date ? `${input.end_date}T23:59:59Z` : undefined,
  });

  let excludedOverBudget = 0;
  let excludedTooFar = 0;
  const events: any[] = [];

  for (const ev of found) {
    let distance: number | undefined;
    if (p.home_lat != null && p.home_lng != null && ev.lat != null && ev.lng != null) {
      distance = Math.round(haversineMiles(p.home_lat, p.home_lng, ev.lat, ev.lng) * 10) / 10;
    }
    if (distance !== undefined && p.max_distance_miles != null && distance > p.max_distance_miles) {
      excludedTooFar++;
      continue;
    }
    const verdict = assessBudget(ev.priceMin, p.budget_cap);
    if (!verdict.include) {
      excludedOverBudget++;
      continue;
    }
    events.push({
      id: ev.id,
      name: ev.name,
      url: ev.url,
      date: ev.date,
      venue: ev.venue,
      city: ev.city,
      state: ev.state,
      category: ev.category,
      price_min: ev.priceMin,
      price_max: ev.priceMax,
      image_url: ev.imageUrl,
      distance_miles: distance,
      budget_note: verdict.note,
    });
  }

  const payload = {
    events: events.slice(0, input?.max_results ?? 25),
    excluded_over_budget: excludedOverBudget,
    excluded_too_far: excludedTooFar,
    ...(explicitLocation ? { home_base_updated: p.home_base_text } : {}),
  };
  return { result: JSON.stringify(payload) };
}

async function updateProfile(input: any, ctx: ToolContext): Promise<ToolOutcome> {
  const patch: Partial<Profile> = {};

  if (input?.home_base) {
    const geo = ctx.geocodeFn ?? geocode;
    const loc = await geo(input.home_base);
    if (!loc) {
      return {
        result: `Could not find "${input.home_base}" on the map. Ask the user to clarify. A city plus state usually works.`,
        isError: true,
      };
    }
    patch.home_base_text = input.home_base;
    patch.home_lat = loc.lat;
    patch.home_lng = loc.lng;
  }
  if (input?.budget_cap !== undefined) patch.budget_cap = input.budget_cap;
  if (input?.max_distance_miles !== undefined) patch.max_distance_miles = input.max_distance_miles;
  if (input?.digest_opt_in !== undefined) patch.digest_opt_in = input.digest_opt_in;

  const additions = ["add_likes", "add_dislikes", "add_vibes", "add_notes"] as const;
  if (additions.some((k) => Array.isArray(input?.[k]) && input[k].length > 0)) {
    const taste = ctx.profile.taste ?? EMPTY_TASTE;
    const merge = (existing: string[], added?: string[]) => [
      ...new Set([...existing, ...(added ?? [])]),
    ];
    patch.taste = {
      likes: merge(taste.likes, input.add_likes),
      dislikes: merge(taste.dislikes, input.add_dislikes),
      vibes: merge(taste.vibes, input.add_vibes),
      notes: merge(taste.notes, input.add_notes),
    };
  }

  const saved = await ctx.saveProfile(patch);
  const summary = {
    home_base: saved.home_base_text,
    budget_cap: saved.budget_cap,
    max_distance_miles: saved.max_distance_miles,
    taste: saved.taste,
    digest_opt_in: saved.digest_opt_in,
  };
  return { result: `Profile updated. Current profile: ${JSON.stringify(summary)}` };
}

function presentEvents(input: any): ToolOutcome {
  const events = (Array.isArray(input?.events) ? input.events : []) as EventCard[];
  return {
    result: `Presented ${events.length} event card(s) to the user with booking links. Do not repeat their details in prose. Add only one short, natural line if it helps.`,
    events,
  };
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "search_events":
        return await searchEvents(input, ctx);
      case "update_profile":
        return await updateProfile(input, ctx);
      case "present_events":
        return presentEvents(input);
      default:
        return { result: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Tool ${name} failed: ${message}`, isError: true };
  }
}

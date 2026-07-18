import { describe, expect, it, vi } from "vitest";
import { humanizeEventReasons } from "../lib/agent/humanizer";
import type { EventCard, Profile } from "../lib/types";

const profile: Profile = {
  id: "user-1",
  email: null,
  home_base_text: "Seattle, WA",
  home_lat: 47.6062,
  home_lng: -122.3321,
  budget_cap: 80,
  max_distance_miles: 20,
  taste: { likes: ["indie pop"], dislikes: [], vibes: [], notes: [] },
  digest_opt_in: true,
};

const event: EventCard = {
  id: "passion-pit",
  name: "Passion Pit",
  url: "https://www.ticketmaster.com/event/123",
  date: "Thu Aug 13, 8:00 PM",
  venue: "Showbox SODO",
  city: "Seattle",
  reason: "You booked Rewind, so Passion Pit is a natural next one from the same era.",
};

describe("humanizeEventReasons", () => {
  it("rewrites reasons while preserving all event data", async () => {
    const converse = vi.fn(async (_input: unknown) => ({
      stopReason: "tool_use",
      output: { message: { role: "assistant", content: [{
        toolUse: {
          toolUseId: "tu_humanizer",
          name: "return_humanized_reasons",
          input: {
            rewrites: [{
              id: "passion-pit",
              reason: "You booked Rewind: The Ultimate 2000s Rave — this is another 2000s booking, this time with Passion Pit.",
            }],
          },
        },
      }] } },
    }));

    const [result] = await humanizeEventReasons({
      bedrock: { converse } as any,
      model: "test-model",
      profile,
      events: [event],
    });

    expect(result).toEqual({
      ...event,
      reason: "You booked Rewind: The Ultimate 2000s Rave, this is another 2000s booking, this time with Passion Pit.",
    });
    expect(converse).toHaveBeenCalledOnce();
    const request = converse.mock.calls[0][0] as any;
    expect(request.toolConfig.toolChoice.tool.name).toBe("return_humanized_reasons");
    expect(request.messages[0].content[0].text).toContain(event.reason);
  });

  it("keeps the original cards when the writing pass fails", async () => {
    const result = await humanizeEventReasons({
      bedrock: { converse: vi.fn(async () => { throw new Error("Bedrock unavailable"); }) },
      model: "test-model",
      profile,
      events: [event],
    });

    expect(result).toEqual([event]);
  });

  it("does not call the model for an empty card list", async () => {
    const converse = vi.fn();
    const result = await humanizeEventReasons({
      bedrock: { converse },
      model: "test-model",
      profile,
      events: [],
    });

    expect(result).toEqual([]);
    expect(converse).not.toHaveBeenCalled();
  });
});

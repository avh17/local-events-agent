import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../lib/agent/loop";
import type { ToolContext } from "../lib/agent/tools";
import type { Profile } from "../lib/types";

function makeCtx(): ToolContext {
  const profile: Profile = {
    id: "user-1",
    email: null,
    home_base_text: "Tempe, AZ",
    home_lat: 33.4255,
    home_lng: -111.94,
    budget_cap: 40,
    max_distance_miles: 20,
    taste: { likes: [], dislikes: [], vibes: [], notes: [] },
    digest_opt_in: true,
  };
  return { profile, saveProfile: vi.fn(async () => profile) };
}

const card = {
  id: "ev-1",
  name: "Indie Night",
  url: "https://tm.example/ev-1",
  date: "Fri Jul 17",
  venue: "The Van Buren",
  city: "Phoenix",
  reason: "Matches your indie taste",
};

function fakeAnthropic(responses: any[]) {
  const calls: any[] = [];
  return {
    calls,
    client: {
      messages: {
        create: vi.fn(async (params: any) => {
          calls.push(params);
          const r = responses[Math.min(calls.length - 1, responses.length - 1)];
          return r;
        }),
      },
    },
  };
}

describe("runAgentLoop", () => {
  it("executes tool calls, collects presented cards, and returns the final text", async () => {
    const { client, calls } = fakeAnthropic([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Let me pull some options." },
          { type: "tool_use", id: "tu_1", name: "present_events", input: { events: [card] } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Enjoy the show!" }],
      },
    ]);

    const result = await runAgentLoop({
      anthropic: client as any,
      model: "claude-sonnet-5",
      system: "You are a concierge.",
      messages: [{ role: "user", content: "What should I do Friday?" }],
      ctx: makeCtx(),
    });

    expect(result.reply).toBe("Enjoy the show!");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("ev-1");

    // Second request must carry the assistant turn + a matching tool_result
    const second = calls[1];
    const assistantTurn = second.messages.at(-2);
    const toolResultTurn = second.messages.at(-1);
    expect(assistantTurn.role).toBe("assistant");
    expect(toolResultTurn.role).toBe("user");
    expect(toolResultTurn.content[0].type).toBe("tool_result");
    expect(toolResultTurn.content[0].tool_use_id).toBe("tu_1");
  });

  it("stops after maxIterations to prevent runaway loops", async () => {
    const { client } = fakeAnthropic([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_x", name: "present_events", input: { events: [] } }],
      },
    ]);

    const result = await runAgentLoop({
      anthropic: client as any,
      model: "claude-sonnet-5",
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      ctx: makeCtx(),
      maxIterations: 3,
    });

    expect((client.messages.create as any).mock.calls.length).toBe(3);
    expect(result.reply.length).toBeGreaterThan(0); // still returns something usable
  });

  it("marks failed tool executions as errors in the tool_result", async () => {
    const { client, calls } = fakeAnthropic([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_bad", name: "no_such_tool", input: {} }],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Sorry about that." }] },
    ]);

    await runAgentLoop({
      anthropic: client as any,
      model: "claude-sonnet-5",
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      ctx: makeCtx(),
    });

    const toolResult = calls[1].messages.at(-1).content[0];
    expect(toolResult.is_error).toBe(true);
  });
});

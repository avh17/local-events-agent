import {
  toBedrockTools,
  type AgentTool,
  type BedrockConverseClient,
} from "../bedrock";
import type { EventCard, FeedbackRow, Profile } from "../types";

const RETURN_REASONS_TOOL = "return_humanized_reasons";

const returnReasonsTool: AgentTool = {
  name: RETURN_REASONS_TOOL,
  description: "Return the final humanized reason for each event card.",
  input_schema: {
    type: "object",
    properties: {
      rewrites: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string" },
          },
          required: ["id", "reason"],
        },
      },
    },
    required: ["rewrites"],
  },
};

export const EVENT_REASON_HUMANIZER_PROMPT = `You are the final writing editor for short event-card reasons. Apply the Humanizer draft, audit, and final rewrite process to every reason in the batch.

For each reason:
1. Preserve the concrete link between the user's taste or past booking and the event. Do not add facts that are absent from the input.
2. Draft a natural rewrite in one or two sentences.
3. Silently ask, "What makes this sound obviously AI-generated?" Check both the individual reason and the batch for repeated templates.
4. Revise once, then return only the final reasons with return_humanized_reasons.

Hard rules for the final reasons:
- Use 12 to 30 words when the available facts allow it. Never exceed 35 words.
- Prefer names and specific details over generic claims.
- Vary openings and sentence shapes across the batch. Do not make every reason follow "You liked X, so Y".
- Cut promotional language, inflated significance, vague praise, filler, excessive hedging, forced enthusiasm, superficial "-ing" analysis, rules of three, and synonym cycling.
- Avoid canned phrases such as "if you're up for," "a natural next one," "fits your vibe," "right up your alley," "a bit different," "same era," "same lane," and "side of things."
- Do not use em dashes, en dashes, emojis, rhetorical questions, "not just X, but Y," fake-candid openers, or manufactured punchlines.
- Do not invent an event's energy, atmosphere, quality, popularity, genre, or similarity to another artist.
- Repeat a simple word when it is the clearest choice. Do not reach for a polished synonym.

Bad: "If you're up for a night that's a bit different from the music shows you've been booking, this is a natural next one."
Better: "Most of your recent bookings are concerts. This is the comedy pick."

Bad: "You booked Rewind, so this synth-heavy indie pop is cut from the same era and works really well in a live setting."
Better: "You booked Rewind: The Ultimate 2000s Rave. This is another 2000s booking, this time with Passion Pit."`;

interface HumanizeEventReasonsOptions {
  bedrock: BedrockConverseClient;
  model: string;
  profile: Profile;
  feedback?: FeedbackRow[];
  events: EventCard[];
}

function normalizeReason(value: string): string {
  return value
    .trim()
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[ \t]+/g, " ");
}

function isUsableReason(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).length <= 35;
}

/**
 * Runs card reasons through a dedicated Humanizer pass. Recommendation data is
 * never delegated to this pass, so a rewrite cannot alter event facts or links.
 */
export async function humanizeEventReasons(
  opts: HumanizeEventReasonsOptions,
): Promise<EventCard[]> {
  if (opts.events.length === 0) return opts.events;

  try {
    const response = await opts.bedrock.converse({
      modelId: opts.model,
      inferenceConfig: { maxTokens: 2000, temperature: 0.3 },
      system: [{ text: EVENT_REASON_HUMANIZER_PROMPT }],
      toolConfig: {
        tools: toBedrockTools([returnReasonsTool]),
        toolChoice: { tool: { name: RETURN_REASONS_TOOL } },
      },
      messages: [{
        role: "user",
        content: [{
          text: JSON.stringify({
            user: {
              taste: opts.profile.taste,
              recent_feedback: opts.feedback ?? [],
            },
            cards: opts.events.map((event) => ({
              id: event.id,
              name: event.name,
              date: event.date,
              venue: event.venue,
              city: event.city,
              original_reason: event.reason,
            })),
          }),
        }],
      }],
    });

    const toolUse = response.output?.message?.content
      ?.find((block) => block.toolUse?.name === RETURN_REASONS_TOOL)
      ?.toolUse;
    const input = toolUse?.input as { rewrites?: Array<{ id?: unknown; reason?: unknown }> } | undefined;
    if (!Array.isArray(input?.rewrites)) return opts.events;

    const rewrites = new Map<string, string>();
    for (const rewrite of input.rewrites) {
      if (typeof rewrite?.id !== "string" || !isUsableReason(rewrite.reason)) continue;
      rewrites.set(rewrite.id, normalizeReason(rewrite.reason));
    }

    return opts.events.map((event) => {
      const reason = rewrites.get(event.id);
      return reason ? { ...event, reason } : event;
    });
  } catch {
    // A writing pass should never prevent otherwise valid recommendations.
    return opts.events;
  }
}

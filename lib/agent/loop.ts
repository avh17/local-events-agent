import type Anthropic from "@anthropic-ai/sdk";
import { executeTool, toolDefinitions, type ToolContext } from "./tools";
import type { EventCard } from "../types";

/** Minimal client surface so tests can inject a fake. */
export interface MinimalAnthropicClient {
  messages: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(params: any): Promise<any>;
  };
}

export interface AgentLoopOptions {
  anthropic: MinimalAnthropicClient;
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  ctx: ToolContext;
  tools?: Anthropic.Tool[];
  maxIterations?: number;
  maxTokens?: number;
}

export interface AgentResult {
  reply: string;
  events: EventCard[];
}

/**
 * Manual tool-use loop: call the model, execute requested tools, feed results
 * back, repeat until the model stops calling tools or we hit the iteration cap.
 * present_events cards are collected out-of-band and returned for the UI.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const collected: EventCard[] = [];
  const maxIterations = opts.maxIterations ?? 8;
  let lastText = "";

  for (let i = 0; i < maxIterations; i++) {
    const response = await opts.anthropic.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      tools: opts.tools ?? toolDefinitions,
      messages,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = response.content ?? [];
    const texts = content.filter((b) => b.type === "text").map((b) => b.text);
    if (texts.length > 0) lastText = texts.join("\n\n");

    if (response.stop_reason !== "tool_use") break;

    const toolUses = content.filter((b) => b.type === "tool_use");
    // Echo the full assistant turn (including thinking blocks) back verbatim.
    messages.push({ role: "assistant", content: response.content });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    for (const tu of toolUses) {
      const outcome = await executeTool(tu.name, tu.input, opts.ctx);
      if (outcome.events) collected.push(...outcome.events);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: outcome.result,
        ...(outcome.isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }

  const fallback = collected.length > 0
    ? "Here are some picks for you."
    : "Sorry — I couldn't finish that request. Mind trying again?";
  return { reply: lastText || fallback, events: collected };
}

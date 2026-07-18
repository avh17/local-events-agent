import type { Message } from "@aws-sdk/client-bedrock-runtime";
import {
  toBedrockTools,
  type AgentTool,
  type BedrockConverseClient,
} from "../bedrock";
import type { EventCard } from "../types";
import { humanizeEventReasons } from "./humanizer";
import { executeTool, toolDefinitions, type ToolContext } from "./tools";

export interface AgentLoopOptions {
  bedrock: BedrockConverseClient;
  model: string;
  system: string;
  messages: Message[];
  ctx: ToolContext;
  tools?: AgentTool[];
  maxIterations?: number;
  maxTokens?: number;
}

export interface AgentResult {
  reply: string;
  events: EventCard[];
}

/**
 * Manual tool-use loop: call Bedrock Converse, execute requested tools, feed
 * results back, and repeat until the model stops or the iteration cap is hit.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentResult> {
  const messages: Message[] = [...opts.messages];
  const collected: EventCard[] = [];
  const maxIterations = opts.maxIterations ?? 8;
  let lastText = "";

  for (let i = 0; i < maxIterations; i++) {
    const response = await opts.bedrock.converse({
      modelId: opts.model,
      inferenceConfig: { maxTokens: opts.maxTokens ?? 8000 },
      system: [{ text: opts.system }],
      toolConfig: { tools: toBedrockTools(opts.tools ?? toolDefinitions) },
      messages,
    });

    const assistantMessage = response.output?.message;
    const content = assistantMessage?.content ?? [];
    const texts = content.flatMap((block) => block.text === undefined ? [] : [block.text]);
    if (texts.length > 0) lastText = texts.join("\n\n");

    if (response.stopReason !== "tool_use" || !assistantMessage) break;

    const toolUses = content.flatMap((block) => block.toolUse ? [block.toolUse] : []);
    messages.push(assistantMessage);

    const results: NonNullable<Message["content"]> = [];
    for (const toolUse of toolUses) {
      const outcome = await executeTool(toolUse.name ?? "", toolUse.input, opts.ctx);
      if (outcome.events) collected.push(...outcome.events);
      results.push({
        toolResult: {
          toolUseId: toolUse.toolUseId,
          content: [{ text: outcome.result }],
          status: outcome.isError ? "error" : "success",
        },
      });
    }
    messages.push({ role: "user", content: results });
  }

  const fallback = collected.length > 0
    ? "I found a few that look promising."
    : "I couldn't finish that search. Try it again in a moment?";
  const events = await humanizeEventReasons({
    bedrock: opts.bedrock,
    model: opts.model,
    profile: opts.ctx.profile,
    feedback: opts.ctx.recentFeedback,
    events: collected,
  });
  return { reply: lastText || fallback, events };
}

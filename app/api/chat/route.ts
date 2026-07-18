import { NextResponse } from "next/server";
import { runAgentLoop } from "@/lib/agent/loop";
import { buildSystemPrompt } from "@/lib/agent/system";
import type { ToolContext } from "@/lib/agent/tools";
import { BEDROCK_MODEL_ID, createBedrockClient } from "@/lib/bedrock";
import { loadOrCreateProfile, makeSaveProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const history: Array<{ role: string; content: string }> | null = Array.isArray(body?.messages)
    ? body.messages
    : null;
  if (!history || history.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const profile = await loadOrCreateProfile(supabase, user.id, user.email ?? null);
  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("event_name, signal")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const save = makeSaveProfile(supabase, user.id);
  const ctx: ToolContext = {
    profile,
    recentFeedback: feedbackRows ?? [],
    saveProfile: async (patch) => {
      // Keep ctx.profile fresh so later tool calls in the same turn see updates.
      ctx.profile = await save(patch);
      return ctx.profile;
    },
  };

  const messages = history
    .slice(-30)
    .filter((m) => typeof m?.content === "string" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: [{ text: m.content }],
    }));

  try {
    const result = await runAgentLoop({
      bedrock: createBedrockClient(),
      model: BEDROCK_MODEL_ID,
      system: buildSystemPrompt(profile, feedbackRows ?? [], new Date()),
      messages,
      ctx,
    });
    return NextResponse.json({ reply: result.reply, events: result.events, profile: ctx.profile });
  } catch (err) {
    console.error("chat agent loop failed", err);
    return NextResponse.json(
      { error: "The concierge hit a snag. Please try again." },
      { status: 500 },
    );
  }
}

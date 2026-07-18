import { NextResponse } from "next/server";
import { Resend } from "resend";
import { humanizeEventReasons } from "@/lib/agent/humanizer";
import { executeTool, toolDefinitions } from "@/lib/agent/tools";
import { HUMAN_WRITING_GUIDE } from "@/lib/agent/system";
import { toTicketmasterDateTime, upcomingWeekend } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchTicketmaster } from "@/lib/ticketmaster";
import type { EventCard, Profile } from "@/lib/types";
import {
  BEDROCK_MODEL_ID,
  createBedrockClient,
  toBedrockTools,
  type BedrockConverseClient,
} from "@/lib/bedrock";

export const maxDuration = 300;

function renderDigestHtml(cards: EventCard[], profile: Profile, siteUrl: string): string {
  const budgetLabel = profile.budget_cap != null
    ? `a $${profile.budget_cap} ticket cap`
    : "no saved ticket budget";
  const distanceLabel = profile.max_distance_miles != null
    ? `a ${profile.max_distance_miles} mile range`
    : "no saved travel range";
  const cardHtml = cards
    .map(
      (c) => `
      <div style="border:1px solid #e3ddd0;border-radius:12px;padding:16px;margin-bottom:14px;font-family:Georgia,serif;">
        <div style="font-size:17px;font-weight:bold;color:#1e1b16;">${c.name}</div>
        <div style="color:#6b6355;font-size:13px;margin:4px 0;">
          ${c.date} · ${c.venue}, ${c.city}
          ${c.distance_miles != null ? ` · ~${c.distance_miles} mi away` : ""}
          ${c.price_min != null ? ` · from $${c.price_min}` : ""}
        </div>
        <div style="color:#3d382f;font-size:14px;margin:6px 0;">${c.reason}</div>
        ${c.budget_note ? `<div style="color:#a15c00;font-size:12px;margin-bottom:6px;">⚠ ${c.budget_note}</div>` : ""}
        <a href="${c.url}" style="display:inline-block;background:#1e1b16;color:#f5efe2;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;">Book it ↗</a>
      </div>`,
    )
    .join("");

  return `
  <div style="max-width:560px;margin:0 auto;background:#faf6ec;padding:24px;border-radius:16px;">
    <h2 style="font-family:Georgia,serif;color:#1e1b16;">Your weekend picks near ${profile.home_base_text ?? "you"}</h2>
    <p style="font-family:Georgia,serif;color:#6b6355;font-size:13px;">
      These picks use your saved preferences, ${budgetLabel}, and ${distanceLabel}.
      Distances are straight-line estimates. When the event feed omits a price, check the live listing against your budget.
    </p>
    ${cardHtml}
    <p style="font-family:Georgia,serif;color:#6b6355;font-size:12px;">
      Want different picks or to change your preferences? <a href="${siteUrl}/chat">Chat with your concierge</a>.
    </p>
  </div>`;
}

async function pickForUser(bedrock: BedrockConverseClient, profile: Profile, candidatesJson: string): Promise<EventCard[]> {
  const response = await bedrock.converse({
    modelId: BEDROCK_MODEL_ID,
    inferenceConfig: { maxTokens: 4000 },
    system: [{
      text: `You curate a weekly weekend digest for a local-events concierge. From the candidate events, pick the 3-5 best fits for this user's taste profile. Write every card reason as one or two natural sentences, no more than 35 words. Connect a specific taste to a detail in the listing. Copy budget_note fields through. If fewer than 3 candidates fit well, pick fewer. Never pad.\n\n${HUMAN_WRITING_GUIDE}`,
    }],
    toolConfig: {
      tools: toBedrockTools(toolDefinitions.filter((tool) => tool.name === "present_events")),
      toolChoice: { tool: { name: "present_events" } },
    },
    messages: [
      {
        role: "user",
        content: [{ text: `User profile: ${JSON.stringify({
          taste: profile.taste,
          budget_cap: profile.budget_cap,
          max_distance_miles: profile.max_distance_miles,
          home_base: profile.home_base_text,
        })}\n\nCandidate events (already distance/budget filtered): ${candidatesJson}` }],
      },
    ],
  });

  const toolUse = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse;
  if (!toolUse) return [];
  const outcome = await executeTool("present_events", toolUse.input, {
    profile,
    saveProfile: async () => profile,
  });
  return humanizeEventReasons({
    bedrock,
    model: BEDROCK_MODEL_ID,
    profile,
    events: outcome.events ?? [],
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("*")
    .eq("digest_opt_in", true)
    .not("home_lat", "is", null)
    .not("email", "is", null)
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bedrock = createBedrockClient();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { start, end } = upcomingWeekend(new Date());

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const profile of (profiles ?? []) as Profile[]) {
    try {
      const candidates = await searchTicketmaster({
        lat: profile.home_lat!,
        lng: profile.home_lng!,
        radiusMiles: profile.max_distance_miles ?? 30,
        startDateTime: toTicketmasterDateTime(start),
        endDateTime: toTicketmasterDateTime(end),
        size: 40,
      });

      // Reuse the exact same filtering path the chat agent uses.
      const filtered = await executeTool(
        "search_events",
        { use_home_base: true },
        { profile, saveProfile: async () => profile, searchFn: async () => candidates },
      );
      const parsed = JSON.parse(filtered.result);
      if (!parsed.events || parsed.events.length === 0) {
        skipped++;
        continue;
      }

      const picks = await pickForUser(bedrock, profile, filtered.result);
      if (picks.length === 0) {
        skipped++;
        continue;
      }

      await resend.emails.send({
        from: process.env.DIGEST_FROM_EMAIL ?? "Concierge <onboarding@resend.dev>",
        to: profile.email!,
        subject: "Your weekend picks are in",
        html: renderDigestHtml(picks, profile, siteUrl),
      });
      sent++;
    } catch (err) {
      failures.push(`${profile.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ sent, skipped, failures });
}

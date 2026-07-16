import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { executeTool, toolDefinitions } from "@/lib/agent/tools";
import { toTicketmasterDateTime, upcomingWeekend } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchTicketmaster } from "@/lib/ticketmaster";
import type { EventCard, Profile } from "@/lib/types";

export const maxDuration = 300;

const MODEL = "claude-sonnet-5";

function renderDigestHtml(cards: EventCard[], profile: Profile, siteUrl: string): string {
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
      Curated against your tastes, your $${profile.budget_cap ?? "—"} cap, and your ${profile.max_distance_miles ?? "—"} mile range.
      Distances are straight-line estimates. Prices marked unlisted should be checked before you go.
    </p>
    ${cardHtml}
    <p style="font-family:Georgia,serif;color:#6b6355;font-size:12px;">
      Want different picks or to change your preferences? <a href="${siteUrl}/chat">Chat with your concierge</a>.
    </p>
  </div>`;
}

async function pickForUser(anthropic: Anthropic, profile: Profile, candidatesJson: string): Promise<EventCard[]> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "disabled" },
    system:
      "You curate a weekly weekend digest for a local-events concierge. From the candidate events, pick the 3-5 best fits for this user's taste profile. Every reason must cite their specific tastes. Copy budget_note fields through. If fewer than 3 candidates fit well, pick fewer — never pad.",
    tools: toolDefinitions.filter((t) => t.name === "present_events"),
    tool_choice: { type: "tool", name: "present_events" },
    messages: [
      {
        role: "user",
        content: `User profile: ${JSON.stringify({
          taste: profile.taste,
          budget_cap: profile.budget_cap,
          max_distance_miles: profile.max_distance_miles,
          home_base: profile.home_base_text,
        })}\n\nCandidate events (already distance/budget filtered): ${candidatesJson}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const outcome = await executeTool("present_events", toolUse.input, {
    profile,
    saveProfile: async () => profile,
  });
  return outcome.events ?? [];
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

  const anthropic = new Anthropic();
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

      const picks = await pickForUser(anthropic, profile, filtered.result);
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

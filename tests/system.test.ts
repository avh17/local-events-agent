import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../lib/agent/system";
import type { Profile } from "../lib/types";

const fullProfile: Profile = {
  id: "user-1",
  email: "test@example.com",
  home_base_text: "Tempe, AZ",
  home_lat: 33.4255,
  home_lng: -111.94,
  budget_cap: 40,
  max_distance_miles: 20,
  taste: { likes: ["jazz", "indie rock"], dislikes: ["EDM"], vibes: ["intimate venues"], notes: [] },
  digest_opt_in: true,
};

const emptyProfile: Profile = {
  id: "user-2",
  email: null,
  home_base_text: null,
  home_lat: null,
  home_lng: null,
  budget_cap: null,
  max_distance_miles: null,
  taste: { likes: [], dislikes: [], vibes: [], notes: [] },
  digest_opt_in: true,
};

describe("buildSystemPrompt", () => {
  it("embeds the user's saved constraints and tastes", () => {
    const prompt = buildSystemPrompt(fullProfile, [], new Date(Date.UTC(2026, 6, 16)));
    expect(prompt).toContain("Tempe, AZ");
    expect(prompt).toContain("40");
    expect(prompt).toContain("20");
    expect(prompt).toContain("jazz");
    expect(prompt).toContain("EDM");
  });

  it("includes the current date so relative requests resolve correctly", () => {
    const prompt = buildSystemPrompt(fullProfile, [], new Date(Date.UTC(2026, 6, 16)));
    expect(prompt).toContain("2026-07-16");
  });

  it("instructs the model to present events as cards, never prose lists", () => {
    const prompt = buildSystemPrompt(fullProfile, [], new Date());
    expect(prompt).toContain("present_events");
  });

  it("asks for human, specific copy and a silent audit pass", () => {
    const prompt = buildSystemPrompt(fullProfile, [], new Date());
    expect(prompt).toContain("knowledgeable friend");
    expect(prompt).toContain("Specific observations beat generic praise");
    expect(prompt).toContain("what still sounds AI-generated");
    expect(prompt).toContain("no more than 35 words");
    expect(prompt).toContain("Do not use em dashes");
  });

  it("is honest about distance being a straight-line approximation", () => {
    const prompt = buildSystemPrompt(fullProfile, [], new Date());
    expect(prompt.toLowerCase()).toContain("straight-line");
  });

  it("switches to onboarding mode when the profile is incomplete", () => {
    const prompt = buildSystemPrompt(emptyProfile, [], new Date());
    expect(prompt.toLowerCase()).toContain("onboarding");
  });

  it("surfaces recent feedback so recommendations improve", () => {
    const prompt = buildSystemPrompt(
      fullProfile,
      [
        { event_name: "Techno Warehouse Rave", signal: "down" },
        { event_name: "Jazz at the Nash", signal: "up" },
      ],
      new Date(),
    );
    expect(prompt).toContain("Techno Warehouse Rave");
    expect(prompt).toContain("Jazz at the Nash");
  });
});

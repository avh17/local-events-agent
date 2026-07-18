# Weekender — local events concierge

A multi-user, chat-first web app: an AI concierge that finds events matching each user's **taste**, **budget**, and **travel range**, then hands off booking via deep links into the vendor's checkout. Includes a weekly email digest of weekend picks.

## Architecture

- **Next.js 15 (App Router, TypeScript)** — chat UI + API routes, deployed on Vercel
- **Supabase** — magic-link auth, Postgres (profiles + feedback) with RLS
- **Claude on Amazon Bedrock (`us.anthropic.claude-sonnet-4-6`)** — Bedrock Converse tool-calling agent loop with three tools:
  - `search_events` — Ticketmaster Discovery API, pre-filtered by distance (haversine from saved home base) and a soft budget filter
  - `update_profile` — saves home base (geocoded via Nominatim), budget cap, max distance, and taste signals
  - `present_events` — structured event cards captured server-side and rendered in the UI with booking links + 👍/👎 feedback
- **Resend + Vercel Cron** — Thursday weekly digest (3–5 taste-matched weekend picks per opted-in user)

Product rules baked in (see `lib/budget.ts`, `lib/agent/system.ts`):

- **Budget is a soft filter** on minimum known price: unknown-price and slightly-over-cap (≤125%) events are shown with transparent labels; only clearly-over events are dropped.
- **Distance is honest**: straight-line miles from home base, never presented as drive time.
- **Booking is a handoff**: the app never touches payment — cards deep-link to vendor checkout.

## Development (TDD)

The core logic is fully unit-tested (Vitest, 42 tests): geo math, budget policy, weekend windows, Ticketmaster URL-building/mapping, geocoding, all three agent tools, the system prompt, and the agent loop (with a mocked Bedrock client). API routes and UI are thin wrappers over these tested modules.

```bash
npm install
npm test          # run the suite
npm run test:watch
npm run dev       # local dev server (needs .env.local, see below)
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql) (tables, RLS, signup trigger).
3. **Authentication → URL Configuration**: set Site URL to your deployed URL and add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback` to Redirect URLs.
4. Copy the project URL, anon key, and service-role key from **Project Settings → API**.

### 2. API keys

| Service | Where | Used for |
|---|---|---|
| Amazon Bedrock | [AWS Bedrock console](https://console.aws.amazon.com/bedrock/) | Claude inference for the agent loop + digest curation |
| Ticketmaster Discovery | [developer.ticketmaster.com](https://developer.ticketmaster.com) (free) | event listings |
| Resend | [resend.com](https://resend.com) (free tier) | weekly digest email; verify a sending domain for `DIGEST_FROM_EMAIL` |

### 3. Environment

```bash
cp .env.example .env.local   # then fill in every value
```

Set `AWS_BEARER_TOKEN_BEDROCK` to a Bedrock API key. `AWS_REGION` defaults to
`us-east-1`, and `BEDROCK_MODEL_ID` defaults to the US cross-region Claude
Sonnet 4.6 inference profile. In production, the standard AWS IAM credential
chain can be used instead of a long-lived API key.

### 4. Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Add all env vars from `.env.example` in the Vercel project settings (set `NEXT_PUBLIC_SITE_URL` to the production URL).
3. `vercel.json` schedules the digest cron (Thursdays 16:00 UTC). Vercel automatically sends `Authorization: Bearer $CRON_SECRET` because a `CRON_SECRET` env var exists.
4. Trigger a manual digest test: `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/digest`

## v1 scope notes / known limitations

- Chat history is stored in the browser (`localStorage`), not the database — the taste profile and feedback persist server-side and travel across devices; the transcript doesn't.
- Event supply is Ticketmaster-only for now (concerts/sports/theater-heavy). Eventbrite's public search API was retired, so community-event coverage is a fast-follow via organizer-based fetching or another source.
- Distances are straight-line approximations by design (labeled as such in the UI); a routing API upgrade is the planned path to real travel times.
- Affiliate tagging on booking links is pending Ticketmaster Impact-network approval; links are plain deep links until then.

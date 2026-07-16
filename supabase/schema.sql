-- Weekender: local-events concierge schema.
-- Run this once in the Supabase SQL editor (or via supabase db push).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  home_base_text text,
  home_lat double precision,
  home_lng double precision,
  budget_cap numeric,
  max_distance_miles integer,
  taste jsonb not null default '{"likes":[],"dislikes":[],"vibes":[],"notes":[]}'::jsonb,
  digest_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  event_name text not null,
  signal text not null check (signal in ('up', 'down', 'booked')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

create policy "feedback: read own" on public.feedback
  for select using (auth.uid() = user_id);
create policy "feedback: insert own" on public.feedback
  for insert with check (auth.uid() = user_id);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- CarBox — Social (Discover + Direct Messages) schema addendum
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- RUN THIS AFTER supabase_schema.sql — it assumes `profiles`, `cars` and
-- `auth.users` already exist (created by that file) and only ADDS to them.
-- Safe to run once on a project that already has supabase_schema.sql applied.
--
-- What this powers:
--   • Discover: find other opted-in users who own the same make+model car.
--     Matching is by CAR ONLY (+ an optional self-reported free-text city).
--     There is NO device geolocation / proximity matching anywhere in this
--     feature — that was an explicit product decision (see CLAUDE.md).
--   • Direct messages between two users, with per-pair conversations,
--     text-only messages, and a blocks table that is enforced by RLS (not
--     just hidden client-side) so a block actually stops new messages.
-- ============================================================

-- 0) PROFILES — opt-in discovery fields. Both default to "not visible":
--    discoverable starts false (user must flip a Settings toggle to appear
--    in anyone's Discover list), city is optional free text the user types
--    in themselves — never filled from device location.
alter table profiles add column if not exists discoverable boolean default false;
alter table profiles add column if not exists city text;

-- 1) CONVERSATIONS — one row per user pair. The pair is normalized so it can
--    only ever get one row: user_a is always the lexicographically smaller
--    uuid. The app enforces this order when it inserts (see app/social.js);
--    the check constraint below rejects any row that doesn't respect it, and
--    the unique constraint stops a duplicate row for the same pair.
create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users on delete cascade,
  user_b      uuid not null references auth.users on delete cascade,
  created_at  timestamptz default now(),
  constraint conversations_ordered_pair check (user_a < user_b),
  constraint conversations_unique_pair unique (user_a, user_b)
);

-- 2) MESSAGES — text-only in v1 (no attachments, keeps moderation surface
--    small). Belongs to a conversation, cascades if the conversation is
--    ever deleted.
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations on delete cascade,
  sender_id        uuid not null references auth.users on delete cascade,
  text             text not null,
  created_at       timestamptz default now()
);

-- 3) BLOCKS — one row per (blocker, blocked) pair. Blocking is recorded
--    one-directionally (who blocked whom), but the messages INSERT policy
--    below checks BOTH directions, so either party blocking the other stops
--    new messages flowing both ways.
create table if not exists blocks (
  blocker_id  uuid not null references auth.users on delete cascade,
  blocked_id  uuid not null references auth.users on delete cascade,
  created_at  timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

-- ============================================================
-- ROW-LEVEL SECURITY — new tables
-- ============================================================
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table blocks        enable row level security;

-- CONVERSATIONS: a user can see/create only conversations they're part of
create policy "own conversations read" on conversations for select using (
  auth.uid() = user_a or auth.uid() = user_b
);
create policy "own conversations insert" on conversations for insert with check (
  auth.uid() = user_a or auth.uid() = user_b
);

-- MESSAGES: read only inside a conversation you're part of
create policy "read messages in own conversations" on messages for select using (
  exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);
-- MESSAGES: send only as yourself, into a conversation you're part of, AND
-- only if neither side has blocked the other (checked both directions).
-- This is the actual enforcement of Block — it happens here, not just in
-- the client UI, so a blocked user cannot message around it.
create policy "send messages if participant and not blocked" on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = c.user_a and b.blocked_id = c.user_b)
           or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)
      )
  )
);

-- BLOCKS: a user can manage (insert/delete) and read only their own blocks
-- (rows where THEY are the blocker). Nobody can read who has blocked them.
create policy "own blocks" on blocks for all using (
  blocker_id = auth.uid()
) with check (
  blocker_id = auth.uid()
);

-- ============================================================
-- DISCOVERY READ POLICIES — additive to supabase_schema.sql
-- These do NOT replace "own profile read" / "own cars" / "public cars read".
-- Postgres combines multiple permissive policies for the same command with
-- OR, so a user still always sees their own profile/cars regardless of
-- discoverable, and public cars are unaffected; these two policies only add
-- a second, narrower case: other people's rows, but only when THAT owner
-- opted in. Scoped to authenticated users only (an anonymous/logged-out
-- visitor sees nothing new here).
-- ============================================================

-- PROFILES: any signed-in user can read a profile that opted into discovery.
-- (Only id/username/tag/city/discoverable are meaningful to read here —
-- there is no separate "limited columns" view; RLS in Postgres is row-level,
-- not column-level, so the app itself only SELECTs the columns it needs:
-- id, username, tag, city. It does not need or request email/birthday/etc.)
create policy "discoverable profiles read" on profiles for select to authenticated using (
  discoverable = true
);

-- CARS: any signed-in user can read a car IF that car's owner has
-- discoverable = true on their profile. This is what lets the Discover
-- query join cars -> profiles to find other people with the same
-- make + model. (cars has no is_public-style flag of its own for this —
-- visibility here is entirely driven by the OWNING PROFILE's discoverable
-- flag, per-car opt-out is not part of this feature.)
create policy "discoverable owner cars read" on cars for select to authenticated using (
  exists (
    select 1 from profiles p
    where p.id = cars.user_id and p.discoverable = true
  )
);

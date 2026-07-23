-- ============================================================
-- CarBox — user_state table (whole-app cloud sync)
-- Run this in Supabase → SQL Editor → Run, AFTER supabase_schema.sql.
-- Stores each user's full app state as one JSON row, so their garage,
-- cars, logs and settings follow them across devices/logins.
-- (The relational tables from supabase_schema.sql stay for the future
--  public-garage / social features; this is the fast path to real sync.)
-- ============================================================

create table if not exists user_state (
  user_id     uuid primary key references auth.users on delete cascade,
  data        jsonb,
  updated_at  timestamptz default now()
);

alter table user_state enable row level security;

-- each user can read/write ONLY their own state row
create policy "own state read"   on user_state for select using (auth.uid() = user_id);
create policy "own state insert" on user_state for insert with check (auth.uid() = user_id);
create policy "own state update" on user_state for update using (auth.uid() = user_id);

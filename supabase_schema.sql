-- ============================================================
-- CarBox — Supabase database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates every table the app needs, plus Row-Level Security so each
-- user only sees their own data (and public garages are world-readable).
-- Safe to run once on a fresh project.
-- ============================================================

-- 1) PROFILES — one row per user account (extends Supabase's auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  first_name  text,
  last_name   text,
  username    text unique,
  tag         text,               -- public @handle
  birthday    date,
  is_pro      boolean default false,
  created_at  timestamptz default now()
);

-- 2) CARS — each car belongs to a user (up to 3 for Pro, enforced in-app)
create table if not exists cars (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text,               -- "Make Model"
  make        text,
  model       text,
  year        int,
  trim        text,
  mileage     int default 0,
  specs       jsonb,              -- {engine,horsepower,torque,transmission,drivetrain,accel}
  appearance  jsonb,              -- {presetId,hue,shade}
  goal        text default 'More power',
  is_public   boolean default false,   -- true = shareable public garage page
  created_at  timestamptz default now()
);

-- 3) ENTRIES — log timeline rows, each belongs to a car
create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references cars on delete cascade,
  type        text,               -- 'mod' | 'maint' | 'repair'
  title       text,
  cost        numeric default 0,
  miles       int,
  date        text,
  notes       text,
  part        text,
  shop        text,
  photos      text[] default '{}',-- storage URLs (filled once photo upload is wired)
  created_at  timestamptz default now()
);

-- 4) COMMENTS — social comments on a car's garage
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references cars on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  text        text,
  reply       text,
  created_at  timestamptz default now()
);

-- 5) LIKES — one like per user per car
create table if not exists likes (
  car_id      uuid not null references cars on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz default now(),
  primary key (car_id, user_id)
);

-- ============================================================
-- ROW-LEVEL SECURITY
-- Turns on per-user isolation. Without this, any user could read
-- anyone's data. Public cars stay readable by everyone.
-- ============================================================
alter table profiles enable row level security;
alter table cars     enable row level security;
alter table entries  enable row level security;
alter table comments enable row level security;
alter table likes    enable row level security;

-- PROFILES: a user can see/edit only their own profile
create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile write"  on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

-- CARS: owner has full access; anyone can READ a car marked public
create policy "own cars"        on cars for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public cars read" on cars for select using (is_public = true);

-- ENTRIES: accessible if you own the parent car, OR the parent car is public (read only)
create policy "own entries" on entries for all using (
  exists (select 1 from cars c where c.id = entries.car_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from cars c where c.id = entries.car_id and c.user_id = auth.uid())
);
create policy "public entries read" on entries for select using (
  exists (select 1 from cars c where c.id = entries.car_id and c.is_public = true)
);

-- COMMENTS: readable on public cars; a user writes/edits only their own comments
create policy "read comments on public cars" on comments for select using (
  exists (select 1 from cars c where c.id = comments.car_id and (c.is_public = true or c.user_id = auth.uid()))
);
create policy "write own comments" on comments for insert with check (auth.uid() = user_id);
create policy "edit own comments"  on comments for update using (auth.uid() = user_id);
create policy "delete own comments" on comments for delete using (auth.uid() = user_id);

-- LIKES: readable by all; a user manages only their own like
create policy "read likes"   on likes for select using (true);
create policy "own like add"  on likes for insert with check (auth.uid() = user_id);
create policy "own like del"  on likes for delete using (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE a profile row whenever a new user signs up
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

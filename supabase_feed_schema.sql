-- ============================================================
-- CarBox — Cross-user FEED schema (foundation step 1 of the social layer)
-- Paste into Supabase → SQL Editor → New query → Run.
-- RUN AFTER supabase_schema.sql (needs `profiles`, `cars`, `auth.users`).
-- Idempotent: safe to run more than once.
--
-- WHY THIS EXISTS:
--   Today the "For You" feed (app/social.js) is entirely local/per-device — a
--   real cross-user feed needs a backend. The base supabase_schema.sql already
--   has profiles/cars/entries/comments/likes with public-read RLS (so public
--   GARAGES can be served), but there is NO posts table, so feed posts have
--   nowhere to live. This file adds the feed tables + RLS. The app-side sync
--   (writing local posts up + reading the cloud feed down) is the next step and
--   lives in app/supabase.js + app/social.js, not here.
--
--   Post shape mirrors app/social.js addPost(): author, car_id, car_label, city,
--   title_suffix, description, photos[], plus threaded comments and per-user
--   likes as their own tables (so counts and "did I like it" are real, not blobs).
-- ============================================================

-- ── POSTS ───────────────────────────────────────────────────
create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,  -- author
  car_id        uuid references cars on delete set null,                -- featured car (nullable)
  car_label     text,                 -- "2021 Toyota GR86" (denormalised for the feed card)
  make          text,                 -- denormalised for the make filter / discovery
  model         text,
  city          text,                 -- self-reported, optional (never device location)
  title_suffix  text,
  description   text,
  photos        text[] default '{}',  -- public Storage URLs
  created_at    timestamptz default now()
);

-- ── POST LIKES (one per user per post) ──────────────────────
create table if not exists post_likes (
  post_id     uuid not null references posts on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz default now(),
  primary key (post_id, user_id)
);

-- ── POST COMMENTS (threaded: parent_id set = a reply) ───────
create table if not exists post_comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  text          text not null,
  parent_id     uuid references post_comments on delete cascade,
  reply_to_tag  text,                 -- @handle this reply addresses (display only)
  created_at    timestamptz default now()
);

-- ============================================================
-- ROW-LEVEL SECURITY
-- The feed is a public, signed-in social feed: any authenticated user can READ
-- all posts/comments/likes; you may only WRITE your own. (Blocks are filtered
-- client-side for the feed; DMs enforce blocks at the DB layer separately.)
-- ============================================================
alter table posts         enable row level security;
alter table post_likes    enable row level security;
alter table post_comments enable row level security;

-- POSTS: world-readable (a post is public content, and a shared public-garage
-- link must resolve for a signed-out viewer too). Writes stay own-only below.
create policy "feed posts read"   on posts for select using (true);
create policy "insert own post"   on posts for insert to authenticated with check (auth.uid() = user_id);
create policy "update own post"   on posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own post"   on posts for delete to authenticated using (auth.uid() = user_id);

-- POST LIKES
create policy "read post likes"   on post_likes for select to authenticated using (true);
create policy "add own post like" on post_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "del own post like" on post_likes for delete to authenticated using (auth.uid() = user_id);

-- POST COMMENTS
create policy "read post comments"   on post_comments for select to authenticated using (true);
create policy "insert own comment"   on post_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "update own comment"   on post_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- a comment can be removed by its author OR by the owner of the post it's on
create policy "delete own or on-my-post comment" on post_comments for delete to authenticated using (
  auth.uid() = user_id
  or exists (select 1 from posts p where p.id = post_comments.post_id and p.user_id = auth.uid())
);

-- ============================================================
-- REALTIME — so the feed and a post's comments can live-update
-- ============================================================
do $$ begin alter publication supabase_realtime add table posts;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table post_likes;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table post_comments; exception when duplicate_object then null; end $$;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists posts_created_idx        on posts (created_at desc);
create index if not exists posts_user_idx           on posts (user_id);
create index if not exists posts_make_idx           on posts (make);
create index if not exists post_likes_post_idx      on post_likes (post_id);
create index if not exists post_comments_post_idx   on post_comments (post_id, created_at);

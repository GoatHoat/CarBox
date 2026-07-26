-- ============================================================
-- CarBox — Block enforcement on cross-user READS (feed + garage posts)
-- Paste into Supabase → SQL Editor → New query → Run.
-- RUN AFTER supabase_feed_schema.sql + supabase_dm_schema.sql (needs posts,
-- post_comments, post_likes, and the blocks table). Idempotent.
--
-- WHY: blocking used to be client-only (app hid a handle's comments), which was
-- fine while the feed was local. Now that real strangers' content is pulled in
-- live, a client-only hide is NOT a safety boundary. This makes a block a real
-- DB boundary: if EITHER party blocked the other, the blocked party's posts /
-- comments / likes simply do not come back from a query — enforced by RLS, so a
-- hand-rolled request can't route around the UI.
--
-- The block is symmetric (checked both directions) and matches the DM enforcement
-- already in supabase_dm_schema.sql. Signed-OUT viewers (auth.uid() IS NULL) are
-- unaffected here — they have no block relationships — so a public garage link
-- still resolves for anonymous visitors exactly as before.
--
-- SCOPE: posts / post_comments / post_likes (the "posts/comments/likes" a user
-- must not be able to read from a blocker). A car's own specs/entries stay
-- readable by a direct is_public link (they are not posts/comments/likes); only
-- the social content is gated, matching the requirement.
-- ============================================================

-- helper predicate reused below: does a block exist between the viewer and :author
-- (either direction)?  Inlined per-policy since RLS can't call a parameterised
-- helper cleanly; kept identical across the three tables on purpose.

-- ── POSTS ───────────────────────────────────────────────────
drop policy if exists "feed posts read" on posts;
create policy "feed posts read" on posts for select using (
  not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = posts.user_id)
       or (b.blocker_id = posts.user_id and b.blocked_id = auth.uid())
  )
);

-- ── POST COMMENTS ───────────────────────────────────────────
drop policy if exists "read post comments" on post_comments;
create policy "read post comments" on post_comments for select using (
  not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = post_comments.user_id)
       or (b.blocker_id = post_comments.user_id and b.blocked_id = auth.uid())
  )
);

-- ── POST LIKES ──────────────────────────────────────────────
drop policy if exists "read post likes" on post_likes;
create policy "read post likes" on post_likes for select using (
  not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = post_likes.user_id)
       or (b.blocker_id = post_likes.user_id and b.blocked_id = auth.uid())
  )
);

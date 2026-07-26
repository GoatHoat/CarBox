-- ============================================================
-- CarBox — Block enforcement on cross-user READS (feed + garage posts)
-- Paste into Supabase → SQL Editor → New query → Run.
-- RUN AFTER supabase_feed_schema.sql + supabase_dm_schema.sql. Idempotent.
-- (Re-run safe: replaces the earlier one-directional version of these policies.)
--
-- WHY A SECURITY DEFINER FUNCTION (this was a real bug in the first version):
--   A naive "not exists (select 1 from blocks ...)" inside a policy runs under
--   the CALLER's RLS on `blocks`. The blocks policy only lets you read rows YOU
--   created (blocker_id = auth.uid()) — intentionally, so nobody can see who
--   blocked them. That means when A blocks B, the row (blocker=A) is invisible
--   to B, so a subquery evaluated as B never sees it and the block silently does
--   nothing in that direction. Proven: B could still read A's posts after A
--   blocked B.
--   is_blocked_between() is SECURITY DEFINER, so it sees ALL blocks regardless
--   of who is querying, and reports a block in EITHER direction. It leaks no row
--   contents (returns only a boolean), so the "can't see who blocked you"
--   privacy property is preserved.
-- ============================================================

create or replace function public.is_blocked_between(u1 uuid, u2 uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from blocks b
    where (b.blocker_id = u1 and b.blocked_id = u2)
       or (b.blocker_id = u2 and b.blocked_id = u1)
  );
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, anon;

-- ── FEED READS: posts / post_comments / post_likes ──────────
-- Signed-out viewers (auth.uid() IS NULL) are unaffected (public links resolve).
drop policy if exists "feed posts read" on posts;
create policy "feed posts read" on posts for select using (
  auth.uid() is null or not public.is_blocked_between(auth.uid(), posts.user_id)
);

drop policy if exists "read post comments" on post_comments;
create policy "read post comments" on post_comments for select using (
  auth.uid() is null or not public.is_blocked_between(auth.uid(), post_comments.user_id)
);

drop policy if exists "read post likes" on post_likes;
create policy "read post likes" on post_likes for select using (
  auth.uid() is null or not public.is_blocked_between(auth.uid(), post_likes.user_id)
);

-- ── DM enforcement fix (same latent bug in supabase_dm_schema.sql) ───────────
-- Re-issue the conversation-start and message-send checks using the definer
-- function so a block stops NEW conversations/messages in BOTH directions, not
-- only when the blocker is the one acting.
drop policy if exists "start conversation if not blocked" on conversations;
create policy "start conversation if not blocked" on conversations for insert with check (
  (auth.uid() = user_a or auth.uid() = user_b)
  and initiator_id = auth.uid()
  and not public.is_blocked_between(user_a, user_b)
);

drop policy if exists "send messages respecting state and blocks" on messages;
create policy "send messages respecting state and blocks" on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
      and (c.status = 'accepted' or (c.status = 'pending' and c.initiator_id = auth.uid()))
      and not public.is_blocked_between(c.user_a, c.user_b)
  )
);

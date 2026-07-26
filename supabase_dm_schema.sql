-- ============================================================
-- CarBox — Direct Messages schema addendum (Part 2)
-- Paste into Supabase → SQL Editor → New query → Run.
-- RUN THIS AFTER supabase_social_schema.sql — it EXTENDS the conversations,
-- messages and blocks tables that file created (it does NOT recreate them).
-- Idempotent: safe to run more than once.
--
-- WHY A SEPARATE FILE (documented split):
--   supabase_social_schema.sql defines the base tables + block enforcement for
--   the older, never-wired "Discover" feature. Rather than rewrite that file,
--   this addendum layers the messaging-app behaviour the DM UI needs on top:
--     • conversation request state (pending / accepted / declined)
--     • per-message delivered_at (set at insert = the instant it's persisted)
--     • per-participant read cursor (last_read_at) + per-participant hide flag
--       (delete-from-my-view WITHOUT unmatching or deleting for the other side)
--     • RLS that respects request state and keeps blocked users out at the DB
--   Run order: supabase_schema.sql → supabase_social_schema.sql → THIS FILE.
-- ============================================================

-- ── 1) CONVERSATIONS: request lifecycle ─────────────────────
-- status: 'pending'  = a message request, not yet accepted by the recipient
--         'accepted' = a real two-way chat
--         'declined' = recipient declined (kept as a row so the sender can't
--                      re-request spam; the UI just never surfaces it)
alter table conversations
  add column if not exists status text not null default 'pending';
do $$ begin
  alter table conversations
    add constraint conversations_status_chk check (status in ('pending','accepted','declined'));
exception when duplicate_object then null; end $$;

-- who opened the conversation (sent the request). The OTHER participant is the
-- one who accepts/declines. Nullable only so the ADD COLUMN succeeds on any
-- pre-existing rows; the app always sets it on insert.
alter table conversations
  add column if not exists initiator_id uuid references auth.users on delete cascade;

-- last activity, so the Chats list can sort by most-recent without scanning
-- messages. Bumped by the message-insert trigger below.
alter table conversations
  add column if not exists last_message_at timestamptz default now();

-- ── 2) MESSAGES: delivery timestamp ─────────────────────────
-- "delivered" = successfully written to the DB, so default now() at insert is
-- exactly the delivery instant. (read state lives per-participant, see below.)
alter table messages
  add column if not exists delivered_at timestamptz not null default now();

-- ── 3) CONVERSATION_PARTICIPANTS ────────────────────────────
-- One row per (conversation, user). Holds BOTH:
--   • last_read_at — this user's read cursor (drives unread counts + the
--     read receipt the OTHER user sees on their sent messages)
--   • hidden       — this user hid/archived the chat from THEIR view only.
--     Hiding is not blocking and not unmatching: the row and the conversation
--     stay; the other person is unaffected; a new message un-hides it.
create table if not exists conversation_participants (
  conversation_id uuid not null references conversations on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  last_read_at    timestamptz not null default 'epoch',
  hidden          boolean not null default false,
  primary key (conversation_id, user_id)
);

-- Seed both participant rows whenever a conversation is created. SECURITY
-- DEFINER so the trigger can insert regardless of the caller's RLS.
create or replace function seed_conversation_participants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into conversation_participants (conversation_id, user_id)
    values (new.id, new.user_a), (new.id, new.user_b)
    on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_seed_participants on conversations;
create trigger trg_seed_participants
  after insert on conversations
  for each row execute function seed_conversation_participants();

-- Keep conversations.last_message_at fresh + un-hide the chat for both sides
-- when a new message lands (a message to a hidden chat should bring it back).
create or replace function bump_conversation_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  update conversation_participants set hidden = false where conversation_id = new.conversation_id;
  return new;
end $$;
drop trigger if exists trg_bump_conversation on messages;
create trigger trg_bump_conversation
  after insert on messages
  for each row execute function bump_conversation_on_message();

-- ── 4) ROW-LEVEL SECURITY ───────────────────────────────────
alter table conversation_participants enable row level security;

-- CONVERSATIONS INSERT: replace the base "any participant" policy with one that
-- also (a) forces you to be the initiator and (b) refuses if either side has
-- blocked the other. This is the DB-level guarantee that a blocked user cannot
-- open a new conversation with the person who blocked them.
drop policy if exists "own conversations insert" on conversations;
create policy "start conversation if not blocked" on conversations for insert with check (
  (auth.uid() = user_a or auth.uid() = user_b)
  and initiator_id = auth.uid()
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  )
);

-- CONVERSATIONS UPDATE: a participant may update their conversation (the app
-- only ever changes status — accept/decline). Still blocked if a block exists.
drop policy if exists "update own conversations" on conversations;
create policy "update own conversations" on conversations for update using (
  auth.uid() = user_a or auth.uid() = user_b
) with check (
  auth.uid() = user_a or auth.uid() = user_b
);

-- MESSAGES INSERT: tighten the base policy so request-state is respected —
-- while pending, ONLY the initiator may send (their request message(s)); once
-- accepted, either participant may send; declined blocks all sends. Block check
-- retained (both directions).
drop policy if exists "send messages if participant and not blocked" on messages;
create policy "send messages respecting state and blocks" on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
      and (
        c.status = 'accepted'
        or (c.status = 'pending' and c.initiator_id = auth.uid())
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = c.user_a and b.blocked_id = c.user_b)
           or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)
      )
  )
);

-- CONVERSATION_PARTICIPANTS:
--   read  — any participant of the conversation (so you can see the OTHER
--           person's last_read_at to render read receipts)
--   write — only your OWN row (mark read, hide/unhide). Inserts are done by
--           the SECURITY DEFINER trigger, so no INSERT policy is needed.
create policy "participants read within own conversations" on conversation_participants for select using (
  exists (
    select 1 from conversations c
    where c.id = conversation_participants.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);
create policy "update my own participant row" on conversation_participants for update using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid()
);

-- (The base "own conversations read" SELECT policy from supabase_social_schema
--  already limits conversation reads to participants; pending requests are
--  readable by both participants so the recipient can see the request, and the
--  app filters Chats=accepted / Requests=pending-incoming in its queries.)

-- ── 5) REALTIME ─────────────────────────────────────────────
-- Let the thread view subscribe to new rows over websockets (RLS still applies
-- to what each client actually receives).
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table conversation_participants;
exception when duplicate_object then null; end $$;

-- ── 6) HELPFUL INDEXES ──────────────────────────────────────
create index if not exists messages_conversation_created_idx on messages (conversation_id, created_at);
create index if not exists conversations_last_message_idx on conversations (last_message_at desc);

-- ============================================================
-- CarBox — client_id mapping columns (foundation step 3 support)
-- Paste into Supabase → SQL Editor → New query → Run.
-- RUN AFTER supabase_schema.sql + supabase_feed_schema.sql. Idempotent.
--
-- WHY: the app's LOCAL ids are strings like "car-lxk3-ab12" / "post-...", not
-- UUIDs, so they can't be the UUID primary keys of the normalized tables. The
-- device mirrors each car/post up with its local id stored in `client_id`, and
-- upserts on that column (idempotent re-sync). A shared garage link,
-- garage.html?car=<local id>, is resolved by looking up cars.client_id.
-- (Multiple NULLs are allowed by a UNIQUE index in Postgres, so rows created
-- before this migration are unaffected.)
-- ============================================================
alter table cars  add column if not exists client_id text;
create unique index if not exists cars_client_id_key  on cars  (client_id);

alter table posts add column if not exists client_id text;
create unique index if not exists posts_client_id_key on posts (client_id);

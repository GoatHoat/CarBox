-- ============================================================
-- CarBox — Stripe entitlement sync migration
-- Run once in Supabase → SQL Editor, after supabase_schema.sql.
--
-- CarBox Pro is sold OUTSIDE the app (Stripe Checkout on the web, so Apple
-- never takes a cut — see app/upgrade.html + server/api/*). This migration
-- adds the plumbing so a Stripe webhook can flip a user's entitlement:
--   1. profiles.stripe_customer_id — maps a Stripe customer back to a user,
--      so later "subscription updated/deleted" events (which only carry the
--      Stripe customer id, not our user id) know whose entitlement to change.
--   2. set_pro_entitlement(uid, pro) — the app's live state lives in
--      user_state.data (a JSON blob with entries/cars/etc., NOT the profiles
--      row), so granting Pro means merging just the "isPro" key into that
--      JSON without clobbering the rest of the blob a device just pushed.
--      A SQL function does that merge atomically; the webhook calls it via
--      Supabase's RPC REST endpoint with the service_role key.
-- ============================================================

alter table profiles add column if not exists stripe_customer_id text unique;

create or replace function set_pro_entitlement(uid uuid, pro boolean)
returns void language plpgsql security definer as $$
begin
  update profiles set is_pro = pro where id = uid;
  update user_state
    set data = jsonb_set(coalesce(data, '{}'::jsonb), '{isPro}', to_jsonb(pro), true)
    where user_id = uid;
end;
$$;

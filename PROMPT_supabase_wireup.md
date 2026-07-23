# CarBox — Claude Code prompt: wire the app to Supabase (auth + data)

Read CLAUDE.md, app/state.js, app/onboarding.js/onboarding.html, and app/settings.html first.
The web code is plain static HTML/JS (no bundler, no npm) loaded in an Expo WebView, so add
Supabase via its CDN build with a <script> tag, matching the existing script-loading pattern.
The Supabase database schema is already created (see supabase_schema.sql in the project root:
tables profiles, cars, entries, comments, likes, with RLS and a new-user trigger).

GOAL: replace the local-only, single-device store with real accounts and cloud data, WITHOUT
breaking the app. It must keep working offline, using localStorage as a cache and syncing to
Supabase when online.

────────────────────────
1. Add the Supabase client
────────────────────────
- Create app/config.js exporting the Project URL and anon public key (the owner will paste
  their two values from Supabase → Project Settings → API). Add a clear comment: anon key only,
  NEVER the service_role key.
- Load the Supabase JS library from its official CDN via a <script> tag on every page that
  needs data (the same place state.js is loaded), before state.js. Create a single shared
  client instance (e.g. window.sb) in a new app/supabase.js.

────────────────────────
2. Real auth (replaces the fake local password)
────────────────────────
- Onboarding Step 2 (account) + the finish step: instead of storing a plaintext password in
  local state, call Supabase Auth signUp with email + password. On the username/tag/birthday/
  car steps, collect as today, then on finish write the profile fields (username, tag,
  first_name, last_name, birthday) to the `profiles` row and create the first `cars` row.
- Add a LOGIN path for returning users (a simple email + password screen reachable from the
  welcome step, "Already have an account? Log in"), calling Supabase Auth signInWithPassword.
- Settings → Sign out: call Supabase signOut (keep the existing local clear too).
- The onboarding gate (pre-paint redirect) should check for a real Supabase session, not just
  the local onboardingComplete flag: no session → onboarding/login; session present → app.
- Keep the security note updated: password is now handled by Supabase Auth, never stored by us.

────────────────────────
3. Swap the store over to Supabase (with offline cache)
────────────────────────
- Refactor state.js so reads/writes go to Supabase for the logged-in user, while keeping a
  localStorage mirror as an offline cache and for instant paint. Pattern: on load, paint from
  the cached copy immediately, then fetch fresh from Supabase and update; on write, update
  local cache + UI instantly and push to Supabase in the background (optimistic update).
- Map the tables to the app's per-car model: cars → the user's cars, entries → each car's log,
  comments/likes → that car's social. If the multi-car refactor (separate prompt) isn't done
  yet, load the user's first car as the active one so existing pages keep working.
- Preserve CarBox.get/set/subscribe/totals/fmtMoney signatures so page code barely changes;
  just change what they read from/write to underneath.
- Photos: wire the Add Entry photo picker to upload files to the Supabase `photos` storage
  bucket and save the returned URLs on the entry row. (This makes Part D photo persistence real.)

────────────────────────
4. Account deletion (App Store requirement)
────────────────────────
- Settings → Delete account must delete the user's server-side data (their cars/entries/etc.
  cascade from the auth user) and the auth account itself, then clear local cache. Because
  fully deleting an auth user requires the service_role key, add a small serverless function
  in /server (POST /api/delete-account, service_role key server-side only) that the app calls;
  document the env var in /server/README.md. Never put the service_role key in the app.

────────────────────────
General
────────────────────────
- No fake fallbacks that silently pretend to save: if a write fails while offline, queue it and
  retry; surface sync state honestly if needed.
- Match existing design/motion. Keep the carbox.v1 cache key for the offline mirror.
- Test the full path: sign up → data appears in Supabase tables → sign out → sign back in on a
  fresh load → data comes back from the server.
- Update CLAUDE.md Status: auth is real, data is in Supabase, what still uses local cache, and
  the new files (config.js, supabase.js) + the delete-account function.

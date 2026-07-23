# CarBox — Claude Code prompt: port the /server backend to Supabase Edge Functions

Read CLAUDE.md, the whole /server folder (server.js, api/recommend.js, api/shops.js,
api/delete-account.js, README.md), and app/upgrades.html (the client that calls these endpoints)
first. Goal: move the backend off a separate host (Vercel/Node) and run it entirely on Supabase
Edge Functions, so the owner uses ONE platform (Supabase) for data, auth, storage, AND the
key-holding backend. Keep behavior identical. Update CLAUDE.md; stop for review.

WHY: the current /server functions are Node/Vercel-format serverless handlers. Supabase Edge
Functions run on Deno with a different signature and a different secrets mechanism. Port them
faithfully.

────────────────────────────────────────
1. Recreate each endpoint as a Supabase Edge Function
────────────────────────────────────────
Create supabase/functions/<name>/index.ts for each existing endpoint, preserving inputs/outputs
EXACTLY as the app expects them (see server/README.md's endpoint table and how upgrades.html calls
them):
- recommend  — POST {make, model, year, trim, specs, goal, budget} -> {recommendations:[{name,benefit,detail} x2], source:"ai"}.
              Same system prompt rules: exactly 2 mods, no stage labels, budget-fit, safety-appropriate,
              and NO em/en dashes in the detail paragraph (strip server-side as a backstop too).
- shops      — POST {lat, lng, modName} -> {shops:[{name, distanceMiles, rating, ratingCount, ratingSource, priceEstimate, mapsUrl}]}.
              Live Google Places call each request; haversine distance; price estimate via LLM or heuristic.
- delete-account — POST (with the caller's access token) -> deletes the caller's Supabase Auth user
              (Apple-required). On Edge Functions this is cleaner: use the service role client to verify
              the token and delete the user.
- generate-car (if the photo-to-pixel feature is built) — same idea: POST photo -> pixel sprite URL.
- a health check equivalent returning which keys are configured.

Use Deno-style fetch and the standard Supabase Edge Function handler signature. Handle CORS
(respond to OPTIONS preflight; allow the app origin) since the app calls these from the browser/WebView.

────────────────────────────────────────
2. Secrets
────────────────────────────────────────
Read keys from Deno.env: ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY, ANTHROPIC_MODEL (optional),
HIGGSFIELD_API_KEY (if generate-car exists). The service_role key and project URL are provided to
Edge Functions automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — use those for
delete-account. Document in a short supabase/functions/README.md how the owner sets each secret:
`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (and via the dashboard). Same graceful behavior
as before: if a key is missing, the endpoint returns the same 503/fallback signal so the app falls
back cleanly (rules-based recs, shops error state, etc.).

────────────────────────────────────────
3. Point the app at the Edge Functions
────────────────────────────────────────
The app currently targets http://<page-host>:8787 or localStorage['carbox.apiBase']. Update the
client so the default API base is the Supabase Functions URL for this project
(https://<project-ref>.functions.supabase.co), reading the project ref from app/config.js (add a
FUNCTIONS_URL or derive it from SUPABASE_URL). Edge Function endpoints are per-function paths
(e.g. .../recommend), so adjust the client's request paths to match. Keep localStorage['carbox.apiBase']
as an override for local testing. Send the Supabase anon key / auth header as Edge Functions expect.

────────────────────────────────────────
4. Keep the old /server as a fallback reference, or remove it
────────────────────────────────────────
Leave /server in the repo but note in its README that the live backend is now Supabase Edge
Functions (so there's no confusion about which one is deployed). Do not delete working code without
saying so.

────────────────────────────────────────
General
────────────────────────────────────────
- Identical request/response shapes so upgrades.html and the photo/PDF features need minimal client
  changes (just the base URL + per-function paths).
- Document the deploy: `supabase functions deploy <name>` for each, and setting secrets.
- Update CLAUDE.md Status (backend now on Supabase Edge Functions; how to deploy + set secrets).
  Stop for owner review.

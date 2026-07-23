# CarBox — Claude Code prompt: budget step + real photo persistence

Read CLAUDE.md, app/goal-picker.html, app/upgrades.html, app/state.js, app/log.html,
app/entry.html, and server/api/recommend.js first. Match the existing design system, per-car
state conventions, and motion rules. Build both parts; update CLAUDE.md Status; stop for review.

════════════════════════════════════════════════════════════
PART 1 — Budget step after choosing a goal
════════════════════════════════════════════════════════════
Goal: never recommend mods the user can't afford.

- After the user selects a goal (in the goal flow / goal-picker.html), add a step that asks
  their budget for this goal. Offer quick-pick ranges AND a custom amount:
  e.g. "Under $500", "$500–$2,000", "$2,000–$5,000", "$5,000+", plus a Custom number input.
  Use the app's existing chip/segmented styling and units/currency formatting (CarBox.fmtMoney).
- Store the budget PER CAR alongside the goal (e.g. car.budget = { min, max } or a single cap).
  It should persist and be editable later (re-opening the goal flow, or from Upgrades).
- Free users: this is part of their one goal selection. Pro users can change it freely, same
  rules as goal changing.

Feed budget into the recommendation engine:
- Pass budget to the backend: include it in the POST /api/recommend body {..., budget}.
- Update the AI system prompt in server/api/recommend.js so the 2 recommendations MUST fit within
  the user's budget (total cost of both, or each, whichever you deem right — state which in the
  prompt). Keep the existing "exactly 2, no stage labels, no em/en dashes in the detail" rules.
- Update the LOCAL FALLBACK recommender in upgrades.html to also respect budget (filter/scale its
  suggestions so it never returns something above the cap).
- If nothing meaningful fits a very low budget, return the best affordable option(s) and a short
  honest note rather than something over budget.
- Optionally show the active budget on the Upgrades screen near the goal chip (e.g. a small
  "Budget: $2,000" label), non-blocking.

════════════════════════════════════════════════════════════
PART 2 — Real photo persistence (the one thing still faked)
════════════════════════════════════════════════════════════
Today the Add Entry sheet shows photo thumbnails but saves `photos: []` — previews only, nothing
is stored. Make photos real using Supabase Storage.

DEPENDENCY: this needs the Supabase client + a logged-in user (from the Supabase wire-up). If the
wire-up isn't in place yet, build the upload path but guard it so it activates once `window.sb`
and a session exist; until then keep the current preview behavior. Do NOT fake persistence by
storing base64 in localStorage.

- On saving an entry with photos: upload each picked file (max 3) to the Supabase Storage
  `photos` bucket, under a path namespaced by user + car + entry (e.g. `${userId}/${carId}/...`).
  Compress/resize client-side before upload (max ~1600px, JPEG ~0.8) to keep files small.
  Save the returned public URLs onto the entry's `photos` array (which already flows to the
  `entries` table via the store).
- Render entry photos from those URLs: on the Log timeline card thumbnails and in the entry
  detail grid (entry.html), replacing any hardcoded/demo images with the entry's real `photos`.
- Handle the states: uploading (show progress or a spinner on the thumb), success, and failure
  (let the user retry; don't lose the entry if a photo fails — save the entry, mark the photo
  as failed).
- The `photos` bucket is public-read, so the saved URLs display without auth (matches the
  shareable public garage page).

════════════════════════════════════════════════════════════
General
════════════════════════════════════════════════════════════
- Use CarBox.get/set so this stays storage-agnostic. New field: per-car `budget`.
- Match colors/fonts/shadows/dark tokens + the single easing family; full reduced-motion fallback.
- Update CLAUDE.md Status (budget field + where it's used; photos now persist to Supabase Storage,
  and the wire-up dependency). Stop for owner browser review when done.

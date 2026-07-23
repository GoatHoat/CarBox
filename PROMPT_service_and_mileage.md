# CarBox — Claude Code prompt: real mileage tracking + service-interval reminders

Read CLAUDE.md, app/state.js, app/onboarding.js/onboarding.html, app/index.html,
app/log.html, and app/settings.html first. Match the existing design system, per-car state
conventions, and motion rules. This REPLACES the earlier "Part C" service-interval stub and the
hardcoded nextService guess. Build all parts; update CLAUDE.md Status when done; stop for review.

Context / problem being solved: the app cannot passively track miles driven (no OBD dongle, no
GPS). So mileage must be captured from the user cheaply, and service reminders must be anchored
to BOTH miles and time ("whichever comes first"), so the time half always works automatically.

════════════════════════════════════════════════════════════
PART 1 — Capture starting mileage (first run)
════════════════════════════════════════════════════════════
- Onboarding Step 5 (car) currently sets mileage to 0. Add a "Current mileage" input to that
  step (units-aware label: mi/km per the user's units setting), required, sensible bounds.
  Store it as the car's real starting odometer instead of 0.
- Fallback for users who somehow have no mileage yet (migrated data, mileage null/0): on the
  next Garage load, show a small one-field sheet asking for current mileage before showing
  reminders. Never show a mileage-based reminder while mileage is unknown.

════════════════════════════════════════════════════════════
PART 2 — Per-session driving estimate (keeps the odometer alive)
════════════════════════════════════════════════════════════
- Store a `lastSessionAt` timestamp. When the app is opened/foregrounded and it's a NEW session
  (not just navigating between tabs within the same session — gate to at most once per app open,
  and never more than once per calendar day), show a lightweight prompt:
  "How many miles have you driven since last time?"
  with quick-pick chips (None, ~25, ~50, ~100, Custom input) and a Skip.
- The chosen amount is ADDED to the active car's stored mileage. Recompute the next service
  after (Part 3). Keep it a fast one-tap interaction using the existing sheet/chip styling.
- SKIP behavior: if the user set an annual-mileage estimate (Part 5), add the pro-rated estimate
  for the days elapsed since lastSessionAt; otherwise add nothing. Never guess silently large.
- Respect a Settings toggle to turn this prompt off entirely (some users won't want it).
- If multi-car exists, apply the increment to the currently-active car only.

════════════════════════════════════════════════════════════
PART 3 — Service-interval logic (miles OR months, whichever first)
════════════════════════════════════════════════════════════
Put this in ONE clearly-commented place (state.js or a new app/service.js).

computeServiceInterval(vehicle) returns BOTH a mileage interval and a time interval:
  - Standard gasoline: 7,500 mi OR 6 months.
  - Turbo/supercharged/performance (detect "turbo"/"supercharged" in specs.engine, or high hp)
    or model year < 2015: 5,000 mi OR 6 months.
  - Electric (Tesla / electric drivetrain): no oil change — "Tire rotation / brake inspection"
    at 7,500 mi OR 12 months.
  Note in comments: sensible approximations, not manufacturer-exact; easy to tune here.

Anchoring (use the active car):
  - Find the most recent maintenance entry (type 'maint'); take BOTH its mileage and its date as
    the anchor. If none, anchor to the starting odometer (Part 1) and the signup/car-added date.
  - mileageDue = anchorMileage + mileageInterval.
  - dateDue    = anchorDate + timeInterval.
  - nextService = whichever comes first in real terms: compare (mileageDue - currentMileage)
    converted to an estimated time-to-reach using annual mileage if known, against (dateDue - now).
    Simpler acceptable approach: store both dueMiles and dueDate and, when displaying, show the
    one that is nearer.

Recompute automatically whenever: entries change, mileage changes (Part 2 or manual edit), or
the car/vehicle is edited.

════════════════════════════════════════════════════════════
PART 4 — Surface it everywhere (driven by the computed value)
════════════════════════════════════════════════════════════
- Garage top notification pill + notifications sheet:
  "Oil change due in ~1,200 mi or 2 months" (show the nearer figure prominently; if past due,
  "Oil change overdue by …"). Use the EV/other title when applicable.
- Log page "Next: <title> …" reminder, same computed value; updates live when a maintenance
  entry is logged (no reload).
- All of the above gated by the existing Settings "Service reminders" toggle (off = hidden).

════════════════════════════════════════════════════════════
PART 5 — Settings additions
════════════════════════════════════════════════════════════
- "Update odometer" quick action (one field, writes current mileage, recomputes service).
- Optional "Miles driven per year" field (powers the Part 2 skip estimate and makes the
  mileage countdown tick between sessions). Clearly optional; label the resulting mileage as an
  estimate wherever it's derived rather than directly entered.
- Toggle: "Ask about driving on open" (controls the Part 2 per-session prompt), default on.

════════════════════════════════════════════════════════════
General
════════════════════════════════════════════════════════════
- Use CarBox.get/set so this stays storage-agnostic (works with localStorage now and Supabase
  later). New fields: lastSessionAt, annualMileage (optional), askDrivingOnOpen (bool), and the
  computed nextService per car.
- Match colors/fonts/shadows/dark tokens + the single easing family; full reduced-motion fallback.
- Update CLAUDE.md Status. Stop for owner browser review when done.

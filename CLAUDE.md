# CarBox — project instructions

CarBox is a mobile-first car enthusiast app: build/maintenance logbook + goal-based mod recommendations + shareable garage page. This folder contains the approved design and the start of the frontend.

## What's here
- `app/index.html` — the **Garage screen, APPROVED by the owner**. This is the golden reference. Its design tokens, spacing, fonts, shadows, and asset usage define the entire app. Never restyle it.
- `app/assets/` — icons and the pixel car sprite, **cropped pixel-for-pixel from the design mockups with transparent backgrounds**. These are sacred: NEVER regenerate, redraw, resize-and-save, or substitute them with icon libraries (no lucide, no font-awesome). Use them via `<img>` exactly as index.html does.
- `*.png` in the root — the design mockups (source of truth for layout):
  - `Untitled design (26).png` — Garage screen (built ✓)
  - `Untitled design (27).png` — Log screen (timeline)
  - `hf_...152254....png` — Upgrades screen (goal + stages + shops map)
  - `hf_...153400....png` — Add Entry bottom sheet
  - `hf_...153622....png` — CarBox Pro paywall popup
  - `hf_...154101....png` — Entry detail screen
  - `hf_...154322....png` — Goal picker screen

## Design system (sampled from mockups — do not invent new values)
- Brown accent `#615142`, soft brown `#7F7269`, active-tab pill `#C9C2BA`
- ALL pages share the Garage background: `#F4F4F4` with a `#F9F9F9` band behind the nav (the shared `.phone` style in `app/style.css`). Owner decision — do NOT use the mockups' warm cream backgrounds.
- Card surface `#F7F7F7`, white pill `#FDFDFC`, hairline `rgba(0,0,0,.10)`
- Shadow `0 10px 26px rgba(0,0,0,.07)`; cards radius 18–22px; pills fully rounded
- Fonts: 'DM Serif Display' for display titles/nav labels ONLY; 'League Spartan' (400–700) for everything else (Google Fonts). Owner decision 2026-07-20: League Spartan REPLACED Fredoka everywhere — do not reintroduce Fredoka.
- Bottom nav (owner decision 2026-07-20): 270×56px pill bar with a sliding `.navpill` highlight (`#C9C2BA`), spring-animated and draggable via the shared `app/nav.js`; each page sets `data-active` on `.nav`. Page scrollbars are hidden (scrolling still works).
- DARK PALETTE (approved 2026-07-21, sampled from the three dark reference renders — all values live ONLY under `html[data-theme="dark"]` in style.css): page/bg `#1D1C1C`, bottom band `#211F20`, card/surface `#292827`, pills+nav `#211F1F`, sheet `#252322`, control track `#3D3B39`, input `#312E2D`. Warm clay accent `#9D8573` (reminder/goal/FAB/see-all/MOD+STAGE chips), rail+dots `#9B8372`, active nav pill `#958274` (label stays `#2A2521`), accent text `#B49C86`. Text: primary `#F2EEE9`, secondary `#D9D3CC`, muted `#A29A93`, meta `#A49B94`. Chips: MAINT `#8A8683`/text `#2E2B29`, REPAIR `#646467`/text `#EDECEF`. Stat circles `#565350`, badge `#D9D3CD`/text `#2A2521`, avatar ring `#A08B77`. Map uses baked `assets/map_shops_dark.png` (dark ground, grey streets, brown pins) via `content:` swap. Icon pattern: `*_dark.png` cream variants or filters — never plain brightness() on antialiased icons.
- Phone shell: max-width 375px centered; fixed bottom nav (copy the nav from index.html verbatim onto every tab screen)

## Working rules
1. Build ONE screen at a time. Match the corresponding mockup PNG closely; where the mockup and index.html conventions conflict, follow index.html.
2. New image assets (map pins, goal icons, camera icon, paywall icons, photos) must be **cropped out of the mockup PNGs** with Python/PIL: crop generously → flood-fill the background to transparent (tolerance ~30 against the corner background color) → trim to the alpha bbox → size in CSS at cropped-pixels ÷ 3 (for 1125-wide mockups) or ÷ 4.1 (for 1536-wide mockups). Visually verify every crop before using it.
3. Sizes: mockup pixels ÷ 3 = CSS px (1125-wide mockups). Measure, don't guess.
4. Keep it vanilla HTML/CSS/JS multi-page (one file per screen, shared `style.css` extracted from index.html) until ALL screens are visually approved. Only then, if asked, port to React.
5. State: vanilla JS + localStorage (entries, likes, goal, plan items, isPro). Seed data must match the mockups (Bugatti Chiron, 82,410 mi, the 4 log entries, $48,200 total).
6. After each screen, stop and ask the owner to review in the browser before continuing.
7. The app name is **CarBox**. Bottom nav labels: `Garage`, `log`, `upgrades` (exact casing).

## Screen order
1. Log (timeline) → 2. Upgrades → 3. Goal picker → 4. Entry detail → 5. Add Entry bottom sheet (overlay on Log) → 6. Pro paywall popup → 7. Wire navigation + localStorage state → 8. Settings (no mockup — reuse existing components/patterns only)

## Status (2026-07-20)
- Built + interactive: Garage, Log, Upgrades, Goal picker, Entry detail, Settings, Onboarding. Shared infra: `app/state.js` (store, localStorage "carbox.v1"), `app/ui.js` (toast/sheet/pressable/stagger/count-up), `app/nav.js` (draggable spring nav pill).
- Specs DB (2026-07-22): `app/data/specs/<brand>.json` — 14 brands / 471 verified model configurations (Audi, BMW, Ford, Honda, Hyundai, Jeep, Kia, Lexus, Mazda, Mercedes-Benz, Nissan, Subaru, Tesla, Toyota), US-market 2010+, web-verified against 0-60specs.com. Schema + integrity rules in `SCHEMA.md`; `index.json` has per-brand counts; `BUILD_LOG.md` has the process notes. 36 honest `null`s (unverifiable figures, never invented). Coverage gaps (missing models/trims per brand) are noted in each file's `note`. Regenerate the app manifest after edits: `scratchpad/gen_cars.py` → `app/data/cars.js`.
- Car manifest (2026-07-22): `app/data/cars.js` — AUTO-GENERATED from the specs DB, loaded as a `<script>` (no fetch; works on file:// + Expo). Exposes `window.CarBoxCars`: `.brands()`, `.models(brand)`, `.lookup(brand,model,year)` → best-matching generation's core-6 specs (`{engine,horsepower,torque,transmission,drivetrain,accel}`, plus `trim`/`generation`/`yearStart`/`yearEnd`/`exact`). Lookup picks the generation whose year range contains the year, else the nearest.
- Onboarding car step reworked (2026-07-22): make + model are now `<select>` dropdowns sourced ONLY from the specs DB (`CarBoxCars`); year enforces the 2010+ policy (`MIN_YEAR` in onboarding.js — pre-2010 is declined inline). Same step now hosts the full appearance customizer (7 presets + hue slider + 8 monotone swatches + Original-grey), identical behavior to Settings' My Car; choices held in the in-memory `A` object and committed at step 6 as `car:{presetId,hue}`. On finish, `vehicle.specs` is filled from `CarBoxCars.lookup` for the chosen make/model/year, and `vehicle.trim` is stored.
- Garage specs are now LIVE (2026-07-22): the six spec rows render from `vehicle.specs` (`paintSpecs` in index.html), and a small clay **Edit** pill above the list opens a sheet (six prefilled fields) to hand-edit them. `null`/empty specs render as "—". `vehicle.specs` shape changed 5→6 fields (added `torque`,`transmission`; dropped `tire`); the dead top-level `specs` array was removed from state.js. (Garage pixel sprite still uses the chosen preset, not a per-model render — unchanged limitation.)
- Onboarding (added 2026-07-21): `app/onboarding.html` + `app/onboarding.js` — 7-step signup (Welcome → Account → Username&tag → Birthday → Car → Terms&Privacy → Done), JS step machine, answers held in memory and committed to the store only at step 6. `MIN_AGE` constant (=16, CarBox policy, enforced) at top of onboarding.js; password is stored plaintext locally for UI only (NOT secure — needs real backend auth, flagged in-file). Curated `CARS` dataset auto-fills `vehicle.specs`. New state fields: `onboardingComplete` (bool), `account` {firstName,lastName,email,password}, `birthday`, and `vehicle` now carries `{name,make,model,year,mileage,specs{engine,horsepower,drivetrain,accel,tire}}`. Gate: the pre-paint `<script>` in index/log/upgrades redirects to onboarding.html unless `onboardingComplete`; `CarBox.requireOnboarding()` mirrors it. NOTE: Garage's pixel sprite + 6 hardcoded spec rows still show demo data until a later feature wires `vehicle.specs`/sprite to the entered car — only name/year/tag hydrate live today. Expo shell `DARK` bumped to `#1D1C1C` to match the dark page bg (no more darker safe-area bezels).
- Pro paywall is LIVE (`app/pro.js`, 2026-07-21): centered modal per mockup hf_...153622, opened from locked goals / settings Upgrade; "Start free week" flips `isPro` (no real payments) and unlocks goals via the `carbox-pro` event. Add Entry sheet is LIVE: FAB morphs into it, FLIP-inserts entries, photos preview, title required.
- Motion (2026-07-21): `UI.spring` physics for nav-pill/sheet gestures, directional View Transitions (`carbox.navdir`), car sprite morphs across pages (`carbox-car`), condensing headers via `UI.condense`, micro-interactions (like burst, toggle squash, bell swing, checkmark draw, pin drop). All respect prefers-reduced-motion.
- Motion rules: one easing family `cubic-bezier(.3,1.4,.4,1)`, fades ease-out, 180–450ms, transform/opacity only, `prefers-reduced-motion` → fades.
- Settings (rebuilt, no nav): collapsible My Car customizer — body-style presets (`assets/preset_*.png`, owner-supplied, background-removed only) + hue tint via `UI.tintSprite` (canvas `color` composite; `{presetId, hue}` in state; every car render goes through `UI.carSprite`). Theme system: Light/Dark/System, `html[data-theme="dark"]` var overrides in style.css; light mode uses per-use `var(--x, <original hex>)` fallbacks and MUST stay pixel-identical; every page head has the pre-paint theme snippet. Currency (USD/EUR/GBP symbol-only) via `CarBox.fmtMoney`.

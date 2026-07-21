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
- Built + interactive: Garage, Log, Upgrades, Goal picker, Entry detail, Settings. Shared infra: `app/state.js` (store, localStorage "carbox.v1"), `app/ui.js` (toast/sheet/pressable/stagger/count-up), `app/nav.js` (draggable spring nav pill).
- Deferred by owner: the Pro paywall (everything Pro-gated is visible but inert → toast). The Add Entry sheet is LIVE again (owner decision 2026-07-20): FAB opens it, entries persist via the store.
- Motion rules: one easing family `cubic-bezier(.3,1.4,.4,1)`, fades ease-out, 180–450ms, transform/opacity only, `prefers-reduced-motion` → fades.
- Settings (rebuilt, no nav): collapsible My Car customizer — body-style presets (`assets/preset_*.png`, owner-supplied, background-removed only) + hue tint via `UI.tintSprite` (canvas `color` composite; `{presetId, hue}` in state; every car render goes through `UI.carSprite`). Theme system: Light/Dark/System, `html[data-theme="dark"]` var overrides in style.css; light mode uses per-use `var(--x, <original hex>)` fallbacks and MUST stay pixel-identical; every page head has the pre-paint theme snippet. Currency (USD/EUR/GBP symbol-only) via `CarBox.fmtMoney`.

# CarBox — Claude Code prompt: photo-to-pixel car (Pro) + PDF history export (Pro)

Read CLAUDE.md, app/state.js, app/onboarding.js, app/settings.html, app/carform.js, app/ui.js,
app/log.html, app/garage.html, and server/api/* first. Match the design system, per-car state,
motion rules, and the existing preset/appearance system. Build BOTH features fully in code so that
the ONLY thing missing is the owner's API key. Where a key is required, build the whole path and
leave a clearly-labeled config placeholder; if the key is absent, fall back gracefully. Update
CLAUDE.md Status; stop for review.

════════════════════════════════════════════════════════════
FEATURE 1 — "Your car in pixels" from a photo (Pro feature; needs an image-gen API key)
════════════════════════════════════════════════════════════
Today car appearance is 5 body-style presets + hue + darkness. Add a Pro option to generate a
custom pixel sprite of the user's ACTUAL car from a photo, in the SAME pixel-art style as the
existing Bugatti sprite (assets/sprite_chiron.png is the style reference).

WHERE IT APPEARS: as an extra choice next to the preset row in all three places appearance is
chosen — onboarding car step, Settings → My Car, and Add Car (carform.js). Label it clearly as a
Pro feature; non-Pro users tapping it get the paywall.

CAPTURE FLOW:
- Request camera permission with consent (getUserMedia; the Expo shell must expose the camera —
  add NSCameraUsageDescription etc.). If denied, explain why and fall back to presets.
- Open a live camera view with a fixed OUTLINE overlay of a car in LEFT-FACING SIDE PROFILE.
- Show prominent, unmissable instruction text: the car MUST be photographed in side profile facing
  LEFT to match the app's style, and that only a left-facing side profile will work. Repeat this so
  the user cannot miss it.
- User takes the picture; show a confirm/retake step before generating.

GENERATION (backend proxy, key server-side only):
- New endpoint POST /api/generate-car in /server: receives the photo, calls the image-gen provider
  with (a) the user's photo and (b) assets/sprite_chiron.png as the STYLE reference, and a prompt:
  produce a LEFT-FACING SIDE-PROFILE pixel-art sprite of this car, same pixel style / line weight /
  shading as the reference, preserving the car's real color and design, on a plain background.
- Provider: build it provider-agnostic but default to HIGGSFIELD (owner will supply HIGGSFIELD_API_KEY;
  Anthropic/others as an easy swap). Document the env var + which provider in /server/README.md.
  Cost is per image — see METERING below.
- Post-process: remove the background to transparent (provider's background-removal if available,
  else a server-side keying step) so the result is a clean sprite like the existing assets. Upload
  the final PNG to the Supabase `photos` (or a new `sprites`) Storage bucket and return its URL.

WIRE INTO STATE:
- Extend car.appearance to support a generated sprite: e.g. { mode:'preset'|'photo', presetId, hue,
  shade, spriteUrl }. UI.carSprite / the sprite painter must render spriteUrl when mode==='photo'
  (hue/darkness controls hidden or disabled for photo mode). Everywhere a car sprite shows (Garage,
  Log mini-sprite, switcher buttons, public garage) uses it.

METERING + STATES (per-image cost, so guard it):
- Pro-only. Limit attempts sensibly (e.g. a small number of generations, with a confirm before each
  since each costs money). Show generating / success (preview + Keep or Try again) / failure (retry
  or fall back to a preset) states. Never leave the user without a working car: if generation fails
  or no key is set, they keep the presets.
- Basic safety: if the photo clearly isn't a car, return a friendly error rather than a bad sprite.

FALLBACK WHEN NO KEY: the whole UI still appears, but selecting "generate from photo" shows a short
"set up your image-gen key to enable this" note (for the owner) and keeps presets working. Adding
the key must make it live with no code changes.

════════════════════════════════════════════════════════════
FEATURE 2 — PDF maintenance/build history export for resale (Pro; NO API key needed)
════════════════════════════════════════════════════════════
The paywall already advertises "PDF history export for resale" but it isn't built. Build it fully.
It must work entirely on-device with NO API key.

- Add an "Export history (PDF)" action (Pro-gated) in Settings and/or on the Log/garage screen for
  the active car.
- Generate a clean, professional PDF containing: the car (name, year, make/model/trim), current
  mileage, owner name/handle, the six specs, total invested, entry count, and the FULL timeline —
  every entry with date, mileage, category (mod/maintenance/repair), title, cost, notes, part/shop
  if present, and its photos. Lay it out like a maintenance record suitable for a resale listing or
  warranty history. Include a header with the CarBox wordmark (reuse existing brand assets, no new
  art) and a generated date.
- Implement client-side: bundle a PDF library LOCALLY (e.g. jsPDF) under app/vendor/ the same way
  vendor/supabase.js is bundled — do NOT rely on a runtime CDN. Pull photos from their URLs / local
  data URLs and embed them.
- Let the user save/share the resulting PDF (download on web; share sheet on device).
- Handle empty logs gracefully (still export the car summary). Works offline.

════════════════════════════════════════════════════════════
General
════════════════════════════════════════════════════════════
- Use CarBox.get/set; new appearance field must migrate safely (existing cars default to mode
  'preset'). Match colors/fonts/shadows/dark tokens + the single easing family; full reduced-motion
  fallback. Gate both features behind the REAL Pro entitlement (or the local isPro flag until IAP is
  wired). Update CLAUDE.md Status and note the new env var + buckets. Stop for owner review.

# CarBox — FINAL completion pass (everything except external API keys / App Store Connect setup)

Read CLAUDE.md, README.md, and skim every file in app/ and server/ first. Goal: make CarBox a
COMPLETE, App-Store-submittable app. Do everything below that can be done IN CODE. Where a step
needs a key, product, or account the owner must create, build the integration and leave a clearly
labeled config placeholder rather than skipping it. Update CLAUDE.md Status as you go. At the very
end, produce SUBMISSION_CHECKLIST.md (see Part 10). Do NOT leave anything half-wired.

────────────────────────────────────────
1. Finish + harden the Supabase connection (auth is already wired via app/supabase.js)
────────────────────────────────────────
- Verify signup creates a real Auth user and that BOTH the profiles row and the full app state
  (user_state) sync. Confirm the whole per-car model (cars[], entries, goals, budget, appearance,
  settings) round-trips: sign up → data in Supabase → sign out → log in on a fresh load → identical
  state returns.
- Add the missing auth UX: a "Forgot password?" flow (Supabase resetPasswordForEmail), clear
  loading/error/success states on login + signup, and session persistence so a logged-in user isn't
  re-asked to onboard. The onboarding gate must treat a valid Supabase session as "done."
- Make photo upload real end-to-end: with a logged-in user, entry photos upload to the Supabase
  `photos` Storage bucket (uploads.js) and the public URLs render on the timeline + entry detail +
  public garage page. Keep the local fallback ONLY when there is no session.
- Everything must degrade gracefully offline (queue writes, never lose an entry, never hard-crash).

────────────────────────────────────────
2. Account deletion (HARD Apple requirement — App Store rejects without it)
────────────────────────────────────────
- Settings → Delete account must delete the user's server-side data AND their auth user, then clear
  local state and return to onboarding. Build a serverless function in /server (POST
  /api/delete-account) that uses the Supabase service_role key SERVER-SIDE ONLY to delete the auth
  user (cascades their rows). Document the env var in /server/README.md. Never put service_role in
  the app. Wire the existing Delete account button to call it with the user's session token.

────────────────────────────────────────
3. Payments — real iOS subscriptions (Pro)
────────────────────────────────────────
The Pro paywall currently just flips a local isPro flag. Integrate a real in-app-purchase layer for
iOS (RevenueCat recommended for Expo; expo-in-app-purchases as an alternative):
- Wire "Start free week" / subscribe to begin a real StoreKit purchase, and gate every Pro feature
  (multi-car, goal/budget changes) off the REAL entitlement, not the local flag.
- Implement "Restore purchases" to call the real restore (also an Apple requirement).
- Leave the product identifiers + RevenueCat/StoreKit API key as clearly-labeled config the owner
  fills in (the owner creates the products in App Store Connect). If keys are absent, fall back to
  the current local flag so the app still runs, but mark this clearly as non-production.

────────────────────────────────────────
4. Service-interval + mileage system (finish if not already complete)
────────────────────────────────────────
Ensure the "miles OR months, whichever first" reminder is in place (see PROMPT_service_and_mileage.md
if not yet built): onboarding captures starting mileage, the per-session "miles driven since last
time?" prompt updates the odometer, reminders show "due in ~X mi or Y months," and everything is
gated by the Settings Service-reminders toggle. If it's already built, just verify and move on.

────────────────────────────────────────
5. Native / Expo configuration (in the Expo shell + app.json)
────────────────────────────────────────
- Add all required iOS permission usage strings: location (NSLocationWhenInUseUsageDescription),
  camera + photo library (NSCameraUsageDescription, NSPhotoLibraryUsageDescription/Add) with honest
  human-readable reasons. Android equivalents too.
- Ensure the WebView enables geolocation and local file access so location + photos work on device.
- Set app name, bundle identifier, version, and build number. Provide the app icon (all required
  sizes) and a launch/splash screen using existing CarBox brand assets (do not invent new art;
  reuse the wordmark + sprite). Confirm it builds.

────────────────────────────────────────
6. Legal (required for approval)
────────────────────────────────────────
- Replace the placeholder Terms/Privacy so the app links to REAL, publicly hosted Privacy Policy and
  Terms of Service URLs (owner will supply the URLs — leave clearly-labeled placeholders and make the
  links open in-app / external browser). The privacy policy must accurately describe what CarBox
  collects (account email, vehicle data, photos, approximate location for shop search).

────────────────────────────────────────
7. Remove ALL development/test affordances
────────────────────────────────────────
- Delete every `.devrow` and temp toggle (e.g. "Switch to Pro / Switch to Base", "Redo onboarding")
  and any other debug-only UI. Nothing that bypasses payments or onboarding may ship.

────────────────────────────────────────
8. User-generated content safety (Apple requires this for anything social)
────────────────────────────────────────
- For comments / public garages: add the ability to report objectionable content, block a user, and
  delete your own content, plus a basic filter. If a feature can't be moderated in time, gate it off
  for v1 rather than shipping it unmoderated. State which choice you made.

────────────────────────────────────────
9. Full QA / hardening pass
────────────────────────────────────────
- No console errors on any page. Every screen has proper empty, loading, and error states.
- No dead links or placeholder URLs reachable by the user. Dark mode is pixel-consistent with light;
  reduced-motion respected everywhere. Accessibility labels on all interactive controls.
- Test the core flows end to end: onboard → add car → log entry with photos → set goal + budget →
  get recommendations (fallback ok without keys) → view garage → share → settings → delete account.

────────────────────────────────────────
10. Output SUBMISSION_CHECKLIST.md
────────────────────────────────────────
List everything the OWNER must still do OUTSIDE the code to actually publish, each with a one-line
how-to: enroll in the Apple Developer Program; create the App Store Connect app + IAP products; add
the API keys (Anthropic, Google/Yelp, RevenueCat, Supabase service_role) and where each goes; deploy
the /server functions; host the Privacy Policy + Terms and paste their URLs; provide screenshots +
app description + age rating; run a production build; submit for review. Mark which items block
submission vs. which can follow.

When finished, update CLAUDE.md Status and stop for owner review. Do not skip any part; if something
truly cannot be completed in code, say so explicitly in SUBMISSION_CHECKLIST.md rather than silently
omitting it.

# CarBox — App Store submission checklist

Everything **in code** is done (see "Built in code" at the bottom). This file lists
what **you (the owner)** must still do outside the code to publish. Each item is
tagged **[BLOCKS]** (submission cannot happen without it) or **[FOLLOWS]** (can be
done during/after review setup).

---

## 1. Apple Developer account
- [ ] **[BLOCKS]** Enroll in the **Apple Developer Program** ($99/yr) at developer.apple.com.
- [ ] **[BLOCKS]** In **App Store Connect**, create a new app. Bundle ID must match
  `expo-shell/app.json` → `ios.bundleIdentifier` (**`com.carbox.app`** — change it there
  if you want a different one; it must be globally unique).

## 2. In-app purchase (Pro subscription)

**As of 2026-07-25 the paywall's Subscribe button is PLATFORM-GATED for App Store compliance**
(`app/pro.js`). Inside the native iOS shell (`window.CARBOX_NATIVE_SHELL === true`) the plan
picker's Subscribe button calls `CarBoxBilling.purchase(plan)` → **Apple StoreKit** (via the
RevenueCat bridge in `expo-shell/App.js`). In a plain browser / on the website it calls
`CarBoxBilling.purchaseViaStripe(plan)` → **Stripe** (lower fees). The old redundant/misleading
**"or pay on app"** secondary button was removed — there is now exactly one Subscribe path per
platform, and **no external Stripe checkout ever opens from inside the app** (that would be an
automatic Guideline 3.1.1 rejection without Apple's External Purchase Link Entitlement, which we
don't have).

- [x] **[DONE]** Compliance gate in `app/pro.js`: in-app → StoreKit, web → Stripe. No Stripe-in-
  Safari from within the app.
- [ ] **[BLOCKS]** In App Store Connect create the subscription products with IDs matching
  `app/config.js` → `CARBOX_BILLING`: **`coilover_pro_monthly`** and **`carbox_pro_annually`**.
  They must reach a state RevenueCat can read (attached to the app / submitted with the 1.0 build —
  `READY_TO_SUBMIT` products don't reliably appear in `getOfferings()`).
- [x] **[DONE]** **RevenueCat** is wired in `expo-shell/App.js` (lazy `ensureRC()`, `window.
  CarBoxNativeBilling` bridge with `getEntitlement/purchase/restore/manage`, entitlement id `pro`,
  real Apple public key `appl_...`). `react-native-purchases` installed.
- [ ] **[BLOCKS]** In the RevenueCat dashboard: add the two App Store products, put them in an
  Offering with **Monthly** + **Annual** packages, and set that offering as **Current**. The
  bridge maps `plan` → package by type; a missing package returns a clear error.
- [x] **[DONE]** Stripe backend (`server/api/stripe-checkout.js`, `stripe-webhook.js`,
  `stripe-portal.js`) is built for the **web** path, and `app/billing.js` wires it. See
  `server/README.md` → "Stripe setup" for the one-time Stripe Dashboard steps (account,
  products/prices, webhook, API keys) — these have to be done by you, not in code.
- [ ] **[TEST]** In a sandbox account inside a real build, confirm the in-app Subscribe completes a
  StoreKit purchase and flips the device to Pro; on the website, confirm Subscribe opens Stripe.

## 3. Backend (server functions + keys)
The `/server` folder holds the proxy that keeps keys server-side. Deploy it and set env vars.
- [ ] **[BLOCKS for account deletion]** Deploy `/server` (Vercel: `cd server && vercel --prod`, or
  any Node 18 host running `node server.js`). Point the app at it via
  `localStorage['carbox.apiBase']` or the same-host `:8787` default.
- [ ] **[BLOCKS for account deletion]** Set **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`**
  (service_role, server-side only) — used by `/api/delete-account`. Never put service_role in the app.
- [ ] **[FOLLOWS]** Set **`ANTHROPIC_API_KEY`** (AI mod recommendations) and **`GOOGLE_MAPS_API_KEY`**
  (nearby shops). Without them the app uses its local fallback / locked-map states, which is fine for review.
- See `server/README.md` for the full env table and endpoints
  (`/api/recommend`, `/api/shops`, `/api/delete-account`, `/api/health`).

## 4. Supabase (accounts, cloud sync, photo storage)
- [ ] **[BLOCKS]** In your Supabase project run the SQL that creates `profiles` + `user_state`
  tables with **Row-Level Security** (each user sees only their own row) and **ON DELETE CASCADE**
  from `auth.users` (so deleting the auth user removes their rows). Anon + URL are already in
  `app/config.js`.
- [ ] **[BLOCKS for photos]** Create a **public-read** Storage bucket named **`photos`**
  (uploads.js writes to `photos/${userId}/${carId}/${entryId}/...`). Add a policy allowing an
  authenticated user to write under their own `${userId}/` prefix.
- [ ] **[FOLLOWS]** Decide email confirmation on/off (Auth settings). If ON, new users confirm by
  email before their session/sync activates (the code already handles both).
- [ ] **[FOLLOWS]** Set the password-reset redirect URL (Auth → URL config) to your `login.html`.

## 5. Legal (required for review)
- [x] **[DONE]** Privacy Policy + Terms are hosted at
  `https://carbox-one.vercel.app/privacy.html` and `/terms.html` and wired into `CARBOX_LEGAL`
  (in-app + onboarding + paywall links all resolve). Privacy discloses account email, vehicle data,
  entry photos, and approximate location (nearby-shop search only).
- [x] **[DONE]** `app/terms.html` §16 governing law is set to **the Commonwealth of Virginia**
  (no bracketed placeholder remains). Still your legal call — have an attorney confirm before launch.
- [ ] **[BLOCKS]** Enter the Privacy Policy URL in App Store Connect (App Privacy section) and fill
  the data-collection questionnaire to match the disclosures above.
- [x] **[DONE]** `CARBOX_LEGAL.SUPPORT_EMAIL` set (`carbox.app@outlook.com`). Still
  **[FOLLOWS]** set `APPSTORE_URL` after first submission ("Rate CarBox" stays hidden until then).

## 6. Store listing assets
- [ ] **[BLOCKS]** App icon: `expo-shell/assets/icon.png` exists — confirm it's 1024×1024 with no
  alpha for the store icon. Splash uses `assets/splash-icon.png` (already configured in app.json).
- [ ] **[BLOCKS]** Screenshots for required device sizes (6.7" and 6.5" iPhone at minimum).
- [ ] **[BLOCKS]** App name, subtitle, description, keywords, category, **age rating** questionnaire
  (CarBox has user comments → answer the UGC questions; see note in section 8).
- [ ] **[FOLLOWS]** Support URL + marketing URL.

## 7. Build & submit
- [x] **[DONE]** `expo-shell/App.js` `CARBOX_URL` now points at production
  **`https://carbox-one.vercel.app/index.html`** (the `app/` folder deployed to Vercel over HTTPS).
  Keep this URL current; re-deploy Vercel after any `app/` change (a `git push` to `main` triggers it).
- [ ] **[BLOCKS]** Production build with EAS: `cd expo-shell && npx eas build -p ios --profile production`
  (requires `eas.json`; run `eas build:configure`). Increment `ios.buildNumber` per upload.
- [ ] **[BLOCKS]** Upload to App Store Connect (EAS Submit or Transporter), attach the IAP products,
  answer the review questions, and **Submit for Review**.

---

## Built in code (done this pass — no owner action needed)
- **Account deletion** (Apple hard requirement): Settings → Delete account calls
  `POST /api/delete-account` (service_role deletes the auth user + cascades), then clears local +
  returns to onboarding. Server fn + docs added.
- **Auth UX**: login page + **Forgot password** (Supabase reset email), loading/error/success states,
  and the onboarding gate now treats a persisted Supabase session as "onboarded" (no re-onboard on a
  fresh device — cloud state pulls in).
- **Payments abstraction** (`billing.js`): every Pro gate reads the entitlement; wired to a native
  bridge when present, local-flag fallback otherwise. Paywall CTA + Restore + Manage all routed
  through it.
- **Subscription lifecycle** (2026-07-25): cancel now takes effect **at period end**, not immediately
  — `stripe-portal.js` attaches a portal Configuration with `subscription_cancel.mode = 'at_period_end'`
  (forced in code, independent of Stripe Dashboard defaults). The webhook persists `cancelAtPeriodEnd`,
  `currentPeriodEnd`, and `subscriptionStatus`, and `supabase.js` now pulls `isPro` **down** from the
  cloud on every reconcile for Stripe-managed accounts (so a server-side cancel/lapse downgrades the
  device automatically on next open; the device used to only push isPro up). Returning from Manage
  (`?fromPortal=1`) re-pulls and toasts the outcome ("Pro until <date>" on a scheduled cancel, "ended"
  on a lapse, "active" on card-update/resubscribe/undo-cancel). **Not yet verified against real Stripe
  events** — needs test-mode keys + a test clock (see note below).
- **Native config**: iOS usage strings for **location, camera, photo library (+add)**; Android
  location/camera/media permissions; bundle id, version 1.0.0, build number, splash; WebView flags
  for geolocation + file/photo access + inline media.
- **Legal**: in-app Privacy/Terms/Support/Rate links + onboarding links read from `CARBOX_LEGAL`
  (placeholders until you host the docs).
- **Dev affordances**: **permanently removed (2026-07-24)**. The DEV-tagged rows ("Redo onboarding",
  "Switch to Pro / Switch to Base"), the 7-tap title unlock, and the `carbox.dev` flag are all gone;
  `config.js` hard-sets `CARBOX_DEV = false` and clears any stale flag. There is no in-app way to grant
  Pro without paying, so nothing here can trip guideline 3.1.1. (Trade-off: there's no longer an
  on-device toggle to revoke Pro — entitlement is now driven by the real StoreKit/Stripe path and, for
  Stripe subscribers, synced down from Supabase.)
- **UGC safety**: comments have **Report**, **Block**, **Delete-your-own**, and a basic profanity
  filter. **Decision:** there is no cross-user social feed in v1 — comments are per-car/local and the
  public garage page shows only the owner's own data — so no un-moderated third-party content ships.
  The moderation hooks are already in place for when a social backend lands.
- **PDF export** (Pro): Log → "Export history (PDF)" builds an on-device resale/warranty report
  (car, specs, totals, full timeline with photos) via locally-bundled jsPDF (`vendor/jspdf.umd.min.js`).
  Share sheet on device, download on web. Works offline; empty logs still export the summary.
- **Service reminders**: "miles OR months, whichever first" ("due in ~X mi or Y mo" / "overdue by …"),
  gated by the Settings toggle. Mileage is derived (deleting the top entry lowers the odometer).

## Consciously deferred (not blockers; documented rather than half-built)
- **Per-session "miles driven since last time?" prompt** (from `PROMPT_service_and_mileage.md`): the
  odometer updates from logged-entry mileage and the miles-or-months reminder is built, but the
  standalone "how many miles since last visit?" check-in prompt is **not** built. Add later if wanted.
- **Full end-to-end sync verification** requires live Supabase keys + a device; the code paths
  (signup→profiles+user_state, pull on fresh login, photo upload) are wired and guarded but should be
  smoke-tested once the tables/bucket above exist.

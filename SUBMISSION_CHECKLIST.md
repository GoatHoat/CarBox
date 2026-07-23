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
- [ ] **[BLOCKS]** In App Store Connect create the subscription products with IDs matching
  `app/config.js` → `CARBOX_BILLING`: **`carbox_pro_monthly`** and **`carbox_pro_annual`**.
- [ ] **[BLOCKS]** Wire **RevenueCat** (recommended) in the Expo shell:
  1. `npx expo install react-native-purchases` (or `expo-in-app-purchases`).
  2. In `expo-shell/App.js`, configure RevenueCat with your **public SDK key**, then inject a
     `window.CarBoxNativeBilling` object into the WebView with `getEntitlement()`, `purchase(plan)`,
     `restore()`, `manage()` (the web app already calls exactly these — see `app/billing.js`).
  3. Entitlement identifier must be **`pro`** (matches `app/billing.js`).
- Until this is wired, "Start free week" and "Restore" fall back to a **local flag** (clearly
  marked NON-PRODUCTION in `billing.js`) so the app still runs. **A shipping build must have the
  native bridge**, or Apple will reject (real StoreKit + working Restore are required).

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
- [ ] **[BLOCKS]** Host a **Privacy Policy** and **Terms of Service** publicly, then paste the URLs
  into `app/config.js` → `CARBOX_LEGAL` (`PRIVACY_URL`, `TERMS_URL`). The Privacy Policy must
  disclose what CarBox collects: **account email, vehicle data, entry photos, approximate location
  (only for nearby-shop search)**. Until set, the in-app links show "not configured yet".
- [ ] **[BLOCKS]** Enter the Privacy Policy URL in App Store Connect (App Privacy section) and fill
  the data-collection questionnaire to match.
- [ ] **[FOLLOWS]** Set `CARBOX_LEGAL.SUPPORT_EMAIL` and `APPSTORE_URL` (for Contact/Rate rows).

## 6. Store listing assets
- [ ] **[BLOCKS]** App icon: `expo-shell/assets/icon.png` exists — confirm it's 1024×1024 with no
  alpha for the store icon. Splash uses `assets/splash-icon.png` (already configured in app.json).
- [ ] **[BLOCKS]** Screenshots for required device sizes (6.7" and 6.5" iPhone at minimum).
- [ ] **[BLOCKS]** App name, subtitle, description, keywords, category, **age rating** questionnaire
  (CarBox has user comments → answer the UGC questions; see note in section 8).
- [ ] **[FOLLOWS]** Support URL + marketing URL.

## 7. Build & submit
- [ ] **[BLOCKS]** Point `expo-shell/App.js` `CARBOX_URL` at where the **web app** is hosted for
  production (today it's a LAN dev server `http://10.0.0.19:8000`). For a real build, host the `app/`
  folder (static) on HTTPS and use that URL, or bundle the web assets into the app.
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
- **Native config**: iOS usage strings for **location, camera, photo library (+add)**; Android
  location/camera/media permissions; bundle id, version 1.0.0, build number, splash; WebView flags
  for geolocation + file/photo access + inline media.
- **Legal**: in-app Privacy/Terms/Support/Rate links + onboarding links read from `CARBOX_LEGAL`
  (placeholders until you host the docs).
- **Dev affordances**: the 5-tap debug sheet is gone. Two DEV-tagged testing buttons remain in
  Settings → Account by owner request — **"Redo onboarding"** and **"Switch to Pro / Switch to Base"**
  (flip the entitlement locally). **[BLOCKS]** Delete these two `.devrow` rows (HTML + their handlers
  in `settings.html`) before submitting — nothing that bypasses payments or onboarding may ship.
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

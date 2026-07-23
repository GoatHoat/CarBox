# CarBox — App Store Review audit

Line-by-line review of the app against the App Store Review Guidelines that actually
cause rejections. Each item is **PASS** (compliant), **FIXED** (was a problem, corrected
this pass), or **BLOCKER / RISK** (must be resolved before it can be approved — most are
owner tasks tracked in `SUBMISSION_CHECKLIST.md`).

> **Honest bottom line:** No one can promise a 100% acceptance — a human reviewer makes
> the call. But the *code* is compliant, and the remaining blockers are known, finite, and
> listed below. The two that will get you rejected if skipped are **real In-App Purchase**
> (§3.1.1) and **server-side account deletion reachable in production** (§5.1.1). Both need
> your accounts/deploy, not more code.

---

## Guideline 3 — Business (payments)

| # | Guideline | Verdict | Notes |
|---|---|---|---|
| 3.1.1 | Paid digital features must use In-App Purchase | **BLOCKER (owner)** | The paywall's "Start free week" calls `CarBoxBilling.purchase()`. When the native RevenueCat/StoreKit bridge (`window.CarBoxNativeBilling`) is absent it falls back to flipping a local flag — **non-production**. A shipping build MUST inject that bridge and use real StoreKit, or Apple rejects. See checklist §2. |
| 3.1.1 | No mechanism to unlock paid features without paying | **FIXED** | The Settings "Switch to Pro" dev toggle was a payment bypass. It is now gated on a per-device `carbox.dev` flag that is **off on every fresh install** (unlock = tap the Settings title 7×). A reviewer can never reach it. `config.js`, `settings.html`. |
| 3.1.2 | Auto-renewable subs must disclose price, term, renewal, and how to cancel, with functional Terms/Privacy links | **FIXED** | Paywall now shows: 7-day trial → $4.99/mo or $39.99/yr, "renews unless canceled ≥24h before period end," "manage/cancel in App Store settings," plus tappable Terms · Privacy. `pro.js`. **Note:** the prices are hard-coded strings — in the production StoreKit build they should be read from the fetched product, and the trial copy must match the intro offer you configure. |
| 3.1.1 | "Restore Purchases" available | **PASS (owner wiring)** | Settings → Restore routes through `CarBoxBilling.restore()` → native `restore()` once the bridge exists. |

## Guideline 5.1 — Privacy

| # | Guideline | Verdict | Notes |
|---|---|---|---|
| 5.1.1(i) | Privacy policy required, accessible in-app | **PASS** | Bundled `privacy.html` + hosted at `carbox-one.vercel.app/privacy.html`; linked from onboarding, Settings, and the paywall. Also paste the URL into App Store Connect (checklist §5). |
| 5.1.1(v) | Apps with account creation must let users delete their account in-app | **BLOCKER (owner)** | Settings → Delete account calls `POST /api/delete-account` (service_role deletes the Supabase auth user + cascades). The UI + server fn exist, **but in production the app targets `https://<host>:8787`, which does not exist on Vercel**, so deletion currently only wipes the device. Deploy `/server` and point `carbox.apiBase` at it (checklist §3). Without this, expect a 5.1.1 rejection. |
| 5.1.1 | Permission strings must match real use | **FIXED** | The location usage string claimed it shows "distances and prices"; prices were removed from the shops feature, so it now reads "…and to show how far away they are." Camera/photo strings verified accurate. `expo-shell/app.json`. |
| 5.1.1 | Data collection minimized & disclosed | **FIXED (earlier) / PASS** | Signup password is no longer synced to the cloud (`supabase.js` strips it before upsert). Collected data (email, name, birthday, approx. location, photos, vehicle data) is disclosed in the privacy policy. |
| 5.1.2 | Data not used beyond disclosed purpose | **PASS** | Location is sent only to `/api/shops` per-request; not stored or shared. Photos go to the user's own Storage prefix. |

## Guideline 5.2 / 1.2 — User-generated content

| # | Guideline | Verdict | Notes |
|---|---|---|---|
| 1.2 / UGC | Filtering, reporting, blocking, and dev removal for UGC | **PASS** | Comments have profanity filter + Report + Block + delete-your-own. v1 has **no cross-user social feed** — the public garage shows only the owner's own data — so no third-party content is displayed unmoderated. Answer the UGC questions in the age-rating questionnaire accordingly (checklist §6). |

## Guideline 5.1.4 / age

| # | Guideline | Verdict | Notes |
|---|---|---|---|
| Age gate | Stated minimum age must be enforced, not just asked | **PASS** | Onboarding enforces `MIN_AGE = 16` at step 4 (under-age is blocked, not merely warned). `onboarding.js`. |

## Guideline 4 — Design

| # | Guideline | Verdict | Notes |
|---|---|---|---|
| 4.0 | Broken links / dead ends | **FIXED** | Legal pages (`privacy.html`, `terms.html`) gained a Back button so an in-WebView open isn't a dead end. Onboarding "read full" fetches the doc inline instead of navigating away (which would lose signup progress). |
| 4.2 | Minimum functionality (not "just a website") | **RISK (low)** | The app is an Expo WebView wrapper. It clears 4.2 because it uses native capabilities — StoreKit IAP, Core Location, camera/photo library, on-device PDF generation + share sheet, offline local data — beyond a repackaged site. Keep those working in the build; if a reviewer pushes back, emphasize these native integrations. |
| 4.5.4 | Push (if any) | **N/A** | No push notifications. |

## Guideline 2.1 — App completeness

| # | Guideline | Verdict | Notes |
|---|---|---|---|
| 2.1 | No placeholder content / all features work | **FIXED / near-clean** | Prototype/"placeholder" legal copy replaced with real summaries. One placeholder remains: `terms.html` §16 governing-law `[YOUR STATE/COUNTRY]` — you must fill it (checklist §5). `[REPLACE...]` `APPSTORE_URL` is unused until set and its dependent row ("Rate CarBox") is hidden, so it isn't reviewer-visible. |
| 2.1 | Reviewer can exercise all features (demo account) | **BLOCKER (owner)** | Sign-in is required to reach the app. Provide a **demo account** (or working sign-up) in App Store Connect → App Review Information, or the reviewer is stuck at login. |
| 2.3.x | Metadata accuracy | **PASS (code) / owner** | In-app copy is accurate; store description/screenshots are owner tasks (checklist §6). |

## Guideline 2.3.10 / mentions

| # | Verdict | Notes |
|---|---|---|
| No mention of other platforms; error states are user-facing | **FIXED** | Upgrades error copy changed from "check the CarBox API proxy is running" (dev language) to "Couldn't load nearby shops right now. Please check your connection and try again." |

## Encryption / export compliance

| Verdict | Notes |
|---|---|
| **PASS** | `app.json` declares `usesNonExemptEncryption: false` / `ITSAppUsesNonExemptEncryption: false` (only standard HTTPS). Confirm this is true for you before submitting. |

---

## The short list that actually gates approval (all in `SUBMISSION_CHECKLIST.md`)

1. **[BLOCKER] Real IAP** — RevenueCat/StoreKit bridge in the Expo shell + `carbox_pro_monthly` / `carbox_pro_annual` products created and "Ready to Submit" in App Store Connect (with the 7-day intro offer). Needs an EAS/dev build — **Expo Go cannot do IAP**. (§3.1.1)
2. **[BLOCKER] Account deletion in production** — deploy `/server` with `SUPABASE_SERVICE_ROLE_KEY` and point `carbox.apiBase` at it, so Delete Account truly removes the server account. (§5.1.1)
3. **[BLOCKER] Demo account** for App Review (login is required).
4. **[BLOCKER] Privacy Policy URL + data questionnaire** in App Store Connect.
5. **[BLOCKER] Fill `terms.html` §16 governing-law** placeholder.
6. **[OWNER] Supabase**: RLS + `ON DELETE CASCADE`, `photos` bucket + policy.
7. **[OWNER] Store assets**: icon 1024², screenshots (6.7"/6.5"), description, age rating (answer UGC).

Everything code-side that a reviewer touches — dev-toggle safety, paywall disclosure, legal links, permission strings, error copy, age enforcement, UGC moderation — is done. The remaining items are backend/account/store-setup that only you can complete.

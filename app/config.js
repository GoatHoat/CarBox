/* CarBox → Supabase connection config.
   These two values connect the app to YOUR Supabase project.
   Get them from Supabase → Project Settings → API:
     • Project URL  → paste into SUPABASE_URL below
     • anon public  → paste into SUPABASE_ANON_KEY below

   ⚠️ Use the "anon public" key ONLY. Never paste the "service_role"
   key here — it bypasses all security and must stay server-side.

   The anon key is safe to ship in the app; it only allows what your
   Row-Level Security policies permit (each user sees their own data). */

window.CARBOX_CONFIG = {
  SUPABASE_URL: 'https://qcydpbguiyxmdclkxvmu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjeWRwYmd1aXl4bWRjbGt4dm11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NTQ1NDEsImV4cCI6MjEwMDMzMDU0MX0.mcODGv7byrOBpuTCzeXg6RGhqP8IE5zQFzxuQH1gquQ'
};

/* ── Dev mode ──
   Dev affordances (Redo onboarding, Switch to Pro/Base) are OFF by default, so
   the App Store build can NEVER ship the payment-bypass toggle that would be an
   automatic rejection (guideline 3.1.1). They live behind a per-device flag.
   To use them on your OWN phone: open Settings and tap the "Settings" title 7
   times — it flips the local 'carbox.dev' flag and reloads. Because it is
   per-device localStorage, it can never appear for a reviewer on a fresh
   install, and there is nothing to remember to turn off before submitting. */
window.CARBOX_DEV = (function () {
  try { return localStorage.getItem('carbox.dev') === '1'; } catch (e) { return false; }
})();

/* ── Legal + support links (REQUIRED for App Store review) ──
   privacy.html + terms.html ship inside the app, so these links always work.
   App Store Connect additionally needs a PUBLIC https URL for the Privacy
   Policy — host the same two files anywhere public and paste that URL into the
   App Privacy section there (the in-app links can stay as the bundled pages).
   APPSTORE_URL is your app's store page ("Rate CarBox" stays hidden until set). */
window.CARBOX_LEGAL = {
  PRIVACY_URL: 'https://carbox-one.vercel.app/privacy.html',
  TERMS_URL: 'https://carbox-one.vercel.app/terms.html',
  SUPPORT_EMAIL: 'carbox.app@outlook.com',
  APPSTORE_URL: 'https://REPLACE_WITH_YOUR_APP_STORE_URL'
};

/* ── In-app purchase config (Pro subscription) ──
   REAL StoreKit purchases run in the native Expo shell via RevenueCat. Put the
   RevenueCat PUBLIC SDK key + product identifiers in the Expo shell (see
   SUBMISSION_CHECKLIST.md); these are here for reference/parity only. */
window.CARBOX_BILLING = {
  ENTITLEMENT: 'pro',
  PRODUCT_MONTHLY: 'carbox_pro_monthly',   // create in App Store Connect
  PRODUCT_ANNUAL: 'carbox_pro_annual'
};

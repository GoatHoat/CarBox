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

/* ── Legal + support links (REQUIRED for App Store review) ──
   Host your Privacy Policy + Terms of Service publicly and paste the URLs here.
   The Privacy Policy must describe what CarBox collects: account email, vehicle
   data, entry photos, and approximate location (only for nearby-shop search).
   Leave the REPLACE_ values and the app shows "not configured yet" instead of a
   dead link. APPSTORE_URL is your app's App Store page (for "Rate CarBox"). */
window.CARBOX_LEGAL = {
  PRIVACY_URL: 'https://REPLACE_WITH_YOUR_PRIVACY_POLICY_URL',
  TERMS_URL: 'https://REPLACE_WITH_YOUR_TERMS_OF_SERVICE_URL',
  SUPPORT_EMAIL: 'REPLACE_WITH_YOUR_SUPPORT_EMAIL',
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

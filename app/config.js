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

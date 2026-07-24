# CarBox API proxy

Small backend that keeps API keys **server-side** and exposes two endpoints for the
Upgrades page. Zero npm dependencies (plain Node 18+, uses built-in `fetch`).

## Endpoints

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/recommend` | `{make, model, year, trim, specs, goal}` | `{recommendations:[{name, benefit, detail} x2], source:"ai"}` |
| `POST /api/shops` | `{lat, lng, modName}` | `{shops:[{name, distanceMiles, mapsUrl}]}` — Places Nearby Search finds relevant shops + location; no ratings/prices |
| `POST /api/delete-account` | `{accessToken}` | `{ok:true}` — deletes the caller's Supabase Auth user (cascades their rows). Apple-required account deletion. |
| `POST /api/create-checkout-session` | `{accessToken, plan}` | `{url}` — Stripe Checkout URL for CarBox Pro. Called ONLY from `app/upgrade.html` (a web page, not linked from inside the iOS app — see that file and `app/pro.js` for why: selling Pro outside the app is what avoids Apple's IAP cut, and that's only compliant if the app itself has zero purchase CTA). |
| `POST /api/billing-portal` | `{accessToken}` | `{url}` — Stripe's hosted subscription-management page for an existing subscriber (update card, switch plan, cancel). Account self-service, not a purchase flow. |
| `POST /api/stripe-webhook` | Stripe event (raw) | `{received:true}` — grants/revokes the `isPro` entitlement in Supabase via `set_pro_entitlement` (see `supabase_stripe_migration.sql`). Point this URL at Stripe Dashboard → Developers → Webhooks. |
| `GET /api/health` | — | `{ok, anthropic, places, stripe}` (which keys are configured) |

- `recommend` calls the Anthropic API (Claude). The system prompt enforces: exactly 2 mods,
  no stage labels, realistic gains/prices, safety-appropriate for the exact car, and **no
  em/en dashes** in the detail paragraph (also stripped server-side as a backstop).
- `shops` calls Google Places Nearby Search **live on every request** to find relevant shops
  near the user and their coordinates, and computes distance (haversine). It returns only
  name, distance, and a Google Maps directions link — no ratings or price estimates.
- The three Stripe endpoints implement CarBox Pro as a **web-sold subscription** (Guideline
  3.1.3(f) "free stand-alone companion app"), so Apple never takes a cut. This only stays
  compliant as long as the iOS app has no purchase button/pricing anywhere in it — see the
  header comment in `app/pro.js` before changing that file.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for AI recs | Get one at console.anthropic.com. Without it `/api/recommend` returns 503 and the app falls back to its built-in rules-based recommender. |
| `GOOGLE_MAPS_API_KEY` | for shops | Google Cloud key with **Places API** enabled. Without it `/api/shops` returns 503 and the app shows its error state. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` for recs. |
| `SUPABASE_URL` | for account deletion, Stripe | Your project URL, e.g. `https://xxxx.supabase.co`. |
| `SUPABASE_ANON_KEY` | for checkout | The **anon public** key (same one already in `app/config.js`) — used only to verify the caller's own session token before creating a Checkout Session on their behalf. |
| `SUPABASE_SERVICE_ROLE_KEY` | for account deletion, Stripe | The **service_role** key (Supabase → Project Settings → API). Server-side ONLY — never ship it in the app. Used by `/api/delete-account` and the Stripe webhook/portal to read/write entitlements. |
| `STRIPE_SECRET_KEY` | for Stripe | Stripe Dashboard → Developers → API keys → **Secret key** (`sk_test_...` while testing, `sk_live_...` in production). |
| `STRIPE_PRICE_MONTHLY` | for Stripe | Price ID (`price_...`) of the monthly CarBox Pro product — create it in Stripe Dashboard → Product catalog. |
| `STRIPE_PRICE_ANNUAL` | for Stripe | Price ID (`price_...`) of the annual CarBox Pro product. |
| `STRIPE_WEBHOOK_SECRET` | for Stripe | Stripe Dashboard → Developers → Webhooks → your endpoint → **Signing secret** (`whsec_...`). Only appears after you create the webhook endpoint (below). |
| `CARBOX_WEB_ORIGIN` | for Stripe | The public origin the web app is hosted at, e.g. `https://carbox-one.vercel.app` (no trailing slash) — used to build Checkout/Portal return URLs. |
| `PORT` | no | Local port, default `8787`. |

### Setting up Stripe (one-time, in the Stripe Dashboard)

1. Create two **Products** (e.g. "CarBox Pro Monthly" $4.99/mo, "CarBox Pro Annual" $39.99/yr),
   each with one recurring Price. Copy each Price ID into `STRIPE_PRICE_MONTHLY` / `_ANNUAL`.
2. Developers → Webhooks → **Add endpoint**: URL = `<CARBOX_WEB_ORIGIN>/api/stripe-webhook`
   (or your local tunnel URL while testing), events = `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copy the **Signing
   secret** into `STRIPE_WEBHOOK_SECRET`.
3. Run `supabase_stripe_migration.sql` in Supabase → SQL Editor (adds `stripe_customer_id`
   to `profiles` + the `set_pro_entitlement` function the webhook calls).
4. Test with Stripe's test card `4242 4242 4242 4242`, any future date/CVC, on
   `app/upgrade.html` while signed in — `isPro` should flip within a few seconds of
   completing checkout (the webhook fires almost immediately).

## Run locally (Windows PowerShell)

```powershell
cd server
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:GOOGLE_MAPS_API_KEY = "AIza..."
npm start        # -> CarBox API proxy on 0.0.0.0:8787
```

The app auto-targets `http://<same-host-as-the-page>:8787`, so if the phone loads the app
from `http://10.0.0.19:8000`, it will call `http://10.0.0.19:8787` — just run this next to
the static server. To point somewhere else (e.g. a deployed URL), set it once in the
browser console: `localStorage.setItem('carbox.apiBase', 'https://your-app.vercel.app')`.

## Deploy

The `api/` folder is already in Vercel's serverless layout:

```bash
cd server
vercel --prod          # then add the env vars in the Vercel dashboard
```

Any Node host works too (`node server.js` behind a reverse proxy). After deploying, set
`carbox.apiBase` (above) to the deployed origin.

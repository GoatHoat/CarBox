# CarBox API proxy

Small backend that keeps API keys **server-side** and exposes endpoints for the
Upgrades page, account deletion, and Pro billing. Uses built-in `fetch` plus one
real dependency (`stripe`) for the billing endpoints — run `npm install` once
before `node server.js` locally (Vercel installs it automatically on deploy).

## Endpoints

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/recommend` | `{make, model, year, trim, specs, goal}` | `{recommendations:[{name, benefit, detail} x2], source:"ai"}` |
| `POST /api/shops` | `{lat, lng, modName}` | `{shops:[{name, distanceMiles, mapsUrl}]}` — Places Nearby Search finds relevant shops + location; no ratings/prices |
| `POST /api/delete-account` | `{accessToken}` | `{ok:true}` — deletes the caller's Supabase Auth user (cascades their rows). Apple-required account deletion. |
| `POST /api/stripe-checkout` | `{plan:'monthly'\|'annual', userId, email}` | `{url}` — Stripe Checkout session to redirect to. **Web/Stripe purchase path only** (never used inside the native iOS app — see app/billing.js). |
| `POST /api/stripe-webhook` | (raw Stripe event, verified via signature) | `ok` — writes `isPro` + `stripeCustomerId` into the user's `user_state` row in Supabase so the app picks it up on next sync. Point Stripe's webhook at this URL. |
| `POST /api/stripe-portal` | `{userId}` | `{url}` — Stripe Billing Portal session so the user can update card / cancel / switch plans. |
| `GET /api/health` | — | `{ok, anthropic, places, stripe, stripeWebhook}` (which keys are configured) |

### Two Pro purchase paths, on purpose

CarBox Pro can be bought two ways, and the client (`app/billing.js`) picks the
right one automatically:

- **Native iOS app** → real StoreKit purchases via RevenueCat (`window.CarBoxNativeBilling`,
  see SUBMISSION_CHECKLIST.md). Apple requires this to stay available inside the app.
- **Any browser (web)** → Stripe Checkout, via the three endpoints above. Cheaper
  fees, but only usable outside the native app shell — `expo-shell/App.js` sets
  `window.CARBOX_NATIVE_SHELL = true` specifically so the web code can tell the two
  apart and never shows the Stripe path inside the App Store build. If you later
  want Stripe checkout available *inside* the iOS app too, that requires applying
  for Apple's External Purchase Link Entitlement first — see the note in
  SUBMISSION_CHECKLIST.md.

- `recommend` calls the Anthropic API (Claude). The system prompt enforces: exactly 2 mods,
  no stage labels, realistic gains/prices, safety-appropriate for the exact car, and **no
  em/en dashes** in the detail paragraph (also stripped server-side as a backstop).
- `shops` calls Google Places Nearby Search **live on every request** to find relevant shops
  near the user and their coordinates, and computes distance (haversine). It returns only
  name, distance, and a Google Maps directions link — no ratings or price estimates.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for AI recs | Get one at console.anthropic.com. Without it `/api/recommend` returns 503 and the app falls back to its built-in rules-based recommender. |
| `GOOGLE_MAPS_API_KEY` | for shops | Google Cloud key with **Places API** enabled. Without it `/api/shops` returns 503 and the app shows its error state. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` for recs. |
| `SUPABASE_URL` | for account deletion + Stripe sync | Your project URL, e.g. `https://xxxx.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | for account deletion + Stripe sync | The **service_role** key (Supabase → Project Settings → API). Server-side ONLY — never ship it in the app. Used by `/api/delete-account` and the Stripe endpoints. |
| `STRIPE_SECRET_KEY` | for web Pro checkout | Stripe Dashboard → Developers → API keys → **Secret key** (`sk_test_...` while testing, `sk_live_...` once real). Server-side ONLY. |
| `STRIPE_PRICE_MONTHLY` | for web Pro checkout | The Price ID (`price_...`) for the $4.99/mo CarBox Pro product — Stripe Dashboard → Product catalog. |
| `STRIPE_PRICE_ANNUAL` | for web Pro checkout | The Price ID (`price_...`) for the $39.99/yr CarBox Pro product. |
| `STRIPE_WEBHOOK_SECRET` | for subscriptions to actually unlock Pro | Stripe Dashboard → Developers → Webhooks → your endpoint → **Signing secret** (`whsec_...`). Without this, checkouts succeed on Stripe's side but CarBox never finds out. |
| `CARBOX_WEB_URL` | for web Pro checkout | The deployed app origin, e.g. `https://carbox-one.vercel.app` — used to build the redirect-back and portal-return URLs. |
| `PORT` | no | Local port, default `8787`. |

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

## Stripe setup (one-time, in the Stripe Dashboard — not code)

1. Create a Stripe account at stripe.com if you don't have one (business details,
   bank account for payouts, and tax info are entered there directly — this part
   has to be done by you, an AI assistant can't fill those in on your behalf).
2. Product catalog → **Add product** → name it "CarBox Pro" → add two prices:
   a recurring **Monthly** price at $4.99, and a recurring **Yearly** price at
   $39.99. Copy each price's ID (`price_...`) into `STRIPE_PRICE_MONTHLY` /
   `STRIPE_PRICE_ANNUAL`.
3. Developers → API keys → copy the **Secret key** into `STRIPE_SECRET_KEY`.
   (Use the test-mode key first, switch the whole set of env vars to the
   live-mode key only once you're ready to take real payments.)
4. Developers → Webhooks → **Add endpoint** → URL = `<your deployed server
   URL>/api/stripe-webhook` (e.g. `https://carboxserver.vercel.app/api/stripe-webhook`)
   → listen for `checkout.session.completed`, `customer.subscription.updated`,
   and `customer.subscription.deleted`. Copy the **Signing secret** into
   `STRIPE_WEBHOOK_SECRET`.
5. Set `CARBOX_WEB_URL` to the deployed app origin (e.g. `https://carbox-one.vercel.app`).
6. Add all five vars (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`,
   `STRIPE_WEBHOOK_SECRET`, `CARBOX_WEB_URL`) to the server's Vercel project the
   same way the other keys were added: `vercel env add STRIPE_SECRET_KEY`, etc.
7. Redeploy the server (`vercel --prod`) so the new env vars take effect, then
   check `GET /api/health` shows `"stripe": true, "stripeWebhook": true`.
8. Test with a real checkout using Stripe's test card `4242 4242 4242 4242`,
   any future expiry, any CVC — confirm the Stripe Dashboard shows the
   subscription AND that the app unlocks Pro after the redirect back.

# CarBox API proxy

Small backend that keeps API keys **server-side** and exposes two endpoints for the
Upgrades page. Zero npm dependencies (plain Node 18+, uses built-in `fetch`).

## Endpoints

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/recommend` | `{make, model, year, trim, specs, goal}` | `{recommendations:[{name, benefit, detail} x2], source:"ai"}` |
| `POST /api/shops` | `{lat, lng, modName}` | `{shops:[{name, distanceMiles, mapsUrl}]}` — Places Nearby Search finds relevant shops + location; no ratings/prices |
| `POST /api/delete-account` | `{accessToken}` | `{ok:true}` — deletes the caller's Supabase Auth user (cascades their rows). Apple-required account deletion. |
| `GET /api/health` | — | `{ok, anthropic, places}` (which keys are configured) |

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
| `SUPABASE_URL` | for account deletion | Your project URL, e.g. `https://xxxx.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | for account deletion | The **service_role** key (Supabase → Project Settings → API). Server-side ONLY — never ship it in the app. Used by `/api/delete-account` to delete the Auth user. |
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

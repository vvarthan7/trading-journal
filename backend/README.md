# Broker proxy

FastAPI service that holds the Angel One SmartAPI credentials and exposes today's fills to the
journal frontend.

It exists because SmartAPI sends no CORS headers, and because `VITE_*` variables are compiled
into the browser bundle — shipping an MPIN and TOTP seed to the browser would publish the second
factor of a live trading account.

**This cannot run on GitHub Pages.** Pages serves static files. Deploy this anywhere that runs
Python and point the frontend at it with `VITE_API_BASE`.

## Where this lives

This folder is part of the `trading-journal` repository, whose root is the Vite frontend. One
repo holds both because they share a contract — change the response shape here and
`src/lib/smartapi.ts` breaks — so they are best changed in one commit.

The practical consequence when deploying: this is a subfolder, not the repo root, so the host
needs its **root directory set to `backend`**. Render, Railway and Fly all support that.

## Run locally

From the repository root:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows;  source .venv/bin/activate elsewhere
pip install -r requirements.txt
cp .env.example .env            # then fill in .env
uvicorn main:app --reload --port 8000
```

Vite already proxies `/api` to `http://127.0.0.1:8000`, so with both running the app works with
no extra configuration.

Check it came up correctly:

```bash
curl http://127.0.0.1:8000/api/health
```

`broker_configured` and `supabase_configured` must both be `true`. No secret is ever returned.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Readiness and which origins are allowed. No auth. |
| `GET /api/trades` | Today's SmartAPI fills, plus `charges` — brokerage and total charges per order ID from SmartAPI's charges estimator (`null`, with `charges_error` set, if that call fails). Requires `Authorization: Bearer <supabase access token>`. |

`/api/trades` verifies the token by asking Supabase who it belongs to, so a stranger who finds
the URL cannot read your trade book. Set `ALLOWED_USER_ID` to lock it to one account.

Lot matching is deliberately **not** done here — it lives in `src/lib/tradeLots.ts`, where it is
already covered by tests. This service returns raw fills.

## Deploying

Any Python host works.

- **Root directory:** `backend`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

Then set every variable from `.env.example` in the host's environment, making sure
`ALLOWED_ORIGINS` contains `https://vvarthan7.github.io`, and set the repository variable
`VITE_API_BASE` in GitHub to the deployed URL plus `/api`, for example
`https://your-service.onrender.com/api`.

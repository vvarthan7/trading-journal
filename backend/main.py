"""
FastAPI proxy for Angel One SmartAPI.

WHY THIS EXISTS
SmartAPI sends no CORS headers, so a browser cannot call it directly — but the bigger reason is
secrets. Anything named VITE_* is compiled into the JavaScript bundle and is readable by anyone
who opens the deployed site. The MPIN and TOTP seed are the full second factor on a live trading
account, so they must never ship to the browser. They live here instead, and the browser only
ever talks to this service.

WHAT IT IS NOT
This does not run on GitHub Pages. Pages serves static files only. Deploy this to any host that
runs Python (Render, Railway, Fly.io, a VPS) and point the frontend at it with VITE_API_BASE.

Trade grouping deliberately stays in the frontend (src/lib/tradeLots.ts), which is already
tested. This service is a thin credential holder: it logs in, fetches, and returns raw fills.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any

import httpx
import pyotp
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

SMARTAPI_ROOT = "https://apiconnect.angelone.in"
LOGIN_PATH = "/rest/auth/angelbroking/user/v1/loginByPassword"
TRADE_BOOK_PATH = "/rest/secure/angelbroking/order/v1/getTradeBook"

SMARTAPI_KEY = os.getenv("SMARTAPI_KEY", "")
SMARTAPI_CLIENT_CODE = os.getenv("SMARTAPI_CLIENT_CODE", "")
SMARTAPI_MPIN = os.getenv("SMARTAPI_MPIN", "")
SMARTAPI_TOTP_SECRET = os.getenv("SMARTAPI_TOTP_SECRET", "")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
# Optional extra lock: only this Supabase user id may call the API.
ALLOWED_USER_ID = os.getenv("ALLOWED_USER_ID", "")

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://vvarthan7.github.io",
    ).split(",")
    if o.strip()
]

# SmartAPI tokens last a trading day; re-login on expiry is cheap, so cache conservatively.
TOKEN_TTL_SECONDS = 6 * 60 * 60

app = FastAPI(title="Trading Journal broker proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

_token: str = ""
_token_at: float = 0.0
_token_lock = threading.Lock()


def _broker_ready() -> bool:
    return all([SMARTAPI_KEY, SMARTAPI_CLIENT_CODE, SMARTAPI_MPIN, SMARTAPI_TOTP_SECRET])


def _smartapi_headers() -> dict[str, str]:
    """A server cannot report a browser's IP or MAC, and SmartAPI only logs them."""
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
        "X-PrivateKey": SMARTAPI_KEY,
    }


def _require_user(authorization: str | None) -> str:
    """
    Verify the caller's Supabase access token by asking Supabase who it belongs to. This avoids
    needing the project's JWT signing secret, and it means a signed-out visitor who finds this
    URL cannot read the trade book.
    """
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(503, "Server is missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    try:
        res = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_PUBLISHABLE_KEY},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Could not reach Supabase: {exc}") from exc

    if res.status_code != 200:
        raise HTTPException(401, "Supabase rejected that token — sign in again")

    user_id = str(res.json().get("id", ""))
    if ALLOWED_USER_ID and user_id != ALLOWED_USER_ID:
        raise HTTPException(403, "That account is not allowed to use this broker connection")
    return user_id


def _login() -> str:
    """Fresh SmartAPI session. TOTP is generated here, from the seed that never leaves the server."""
    totp = pyotp.TOTP(SMARTAPI_TOTP_SECRET).now()
    try:
        res = httpx.post(
            SMARTAPI_ROOT + LOGIN_PATH,
            json={
                "clientcode": SMARTAPI_CLIENT_CODE,
                "password": SMARTAPI_MPIN,
                "totp": totp,
                "state": "journal",
            },
            headers=_smartapi_headers(),
            timeout=20,
        )
        body: dict[str, Any] = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, f"SmartAPI login failed: {exc}") from exc

    if not body.get("status") or not body.get("data", {}).get("jwtToken"):
        raise HTTPException(502, body.get("message") or "SmartAPI refused the login")
    return str(body["data"]["jwtToken"])


def _session_token(force_new: bool = False) -> str:
    global _token, _token_at
    with _token_lock:
        fresh = _token and (time.time() - _token_at) < TOKEN_TTL_SECONDS
        if force_new or not fresh:
            _token = _login()
            _token_at = time.time()
        return _token


def _is_auth_error(code: str) -> bool:
    return code.startswith("AG8") or code in {"AB8050", "AB8051"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Readiness without leaking anything — useful for checking a deployment's env vars."""
    return {
        "ok": True,
        "broker_configured": _broker_ready(),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY),
        "allowed_origins": ALLOWED_ORIGINS,
    }


@app.get("/api/trades")
def trades(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """
    Today's fills, exactly as SmartAPI returns them. The frontend does the FIFO lot matching.

    SmartAPI has no historical trade endpoint, so this is the current session only and an empty
    list outside market hours is the correct answer, not an error.
    """
    _require_user(authorization)

    if not _broker_ready():
        raise HTTPException(
            503,
            "Broker credentials are not configured on the server — set SMARTAPI_CLIENT_CODE, "
            "SMARTAPI_MPIN and SMARTAPI_TOTP_SECRET in the backend environment",
        )

    def call(token: str) -> dict[str, Any]:
        res = httpx.get(
            SMARTAPI_ROOT + TRADE_BOOK_PATH,
            headers={**_smartapi_headers(), "Authorization": f"Bearer {token}"},
            timeout=20,
        )
        return res.json()

    try:
        body = call(_session_token())
        if not body.get("status") and _is_auth_error(str(body.get("errorcode", ""))):
            body = call(_session_token(force_new=True))
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, f"SmartAPI trade book failed: {exc}") from exc

    if not body.get("status"):
        raise HTTPException(502, body.get("message") or "SmartAPI returned an error")

    return {"fills": body.get("data") or []}

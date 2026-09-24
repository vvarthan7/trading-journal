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
tested. This service is a thin credential holder: it logs in, fetches, and returns raw fills
alongside each order's charges from SmartAPI's estimator (splitting those onto lots is also the
frontend's job, since only it knows the lots).
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
ORDER_BOOK_PATH = "/rest/secure/angelbroking/order/v1/getOrderBook"
CHARGES_PATH = "/rest/secure/angelbroking/brokerage/v1/estimateCharges"

# Orders per estimateCharges call. SmartAPI does not document a ceiling, so stay modest.
CHARGES_BATCH = 25

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


def _smartapi(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """One authenticated SmartAPI call, retried once on a fresh session if the token expired."""

    def call(token: str) -> dict[str, Any]:
        res = httpx.request(
            method,
            SMARTAPI_ROOT + path,
            json=payload,
            headers={**_smartapi_headers(), "Authorization": f"Bearer {token}"},
            timeout=20,
        )
        return res.json()

    body = call(_session_token())
    if not body.get("status") and _is_auth_error(str(body.get("errorcode", ""))):
        body = call(_session_token(force_new=True))
    return body


def _brokerage_of(breakup: list[dict[str, Any]]) -> float:
    """The broker's own fee, as opposed to exchange charges, STT, stamp duty, SEBI fees and GST."""
    return sum(
        float(item.get("amount") or 0)
        for item in breakup
        if "brokerage" in str(item.get("name", "")).lower()
    )


def _order_charges(fills: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    """
    Charges per order ID, from SmartAPI's charges estimator.

    Brokerage is levied per executed *order*, not per fill, so fills are folded back into their
    order first — asking about each fill separately would charge the flat fee once per partial
    fill. The estimator needs the instrument token, which the trade book does not carry, so it is
    looked up in the order book.

    Raises on anything unexpected; the caller turns that into a warning rather than a failed sync.
    """
    book = _smartapi("GET", ORDER_BOOK_PATH)
    if not book.get("status"):
        raise RuntimeError(book.get("message") or "order book unavailable")
    tokens = {str(o.get("orderid")): str(o.get("symboltoken") or "") for o in book.get("data") or []}

    orders: dict[str, dict[str, Any]] = {}
    for f in fills:
        oid = str(f.get("orderid", ""))
        qty = float(f.get("fillsize") or 0)
        o = orders.setdefault(
            oid,
            {
                "product_type": f.get("producttype", ""),
                "transaction_type": f.get("transactiontype", ""),
                "exchange": f.get("exchange", ""),
                "symbol_name": f.get("tradingsymbol", ""),
                "token": tokens.get(oid, ""),
                "qty": 0.0,
                "value": 0.0,
            },
        )
        o["qty"] += qty
        o["value"] += qty * float(f.get("fillprice") or 0)

    # Without a token the estimate would be for the wrong instrument, or refused outright.
    priced = [(oid, o) for oid, o in orders.items() if o["token"] and o["qty"] > 0]

    out: dict[str, dict[str, float]] = {}
    for i in range(0, len(priced), CHARGES_BATCH):
        batch = priced[i : i + CHARGES_BATCH]
        body = _smartapi(
            "POST",
            CHARGES_PATH,
            {
                "orders": [
                    {
                        "product_type": o["product_type"],
                        "transaction_type": o["transaction_type"],
                        "quantity": str(int(o["qty"])),
                        "price": f"{o['value'] / o['qty']:.4f}",
                        "exchange": o["exchange"],
                        "symbol_name": o["symbol_name"],
                        "token": o["token"],
                    }
                    for _, o in batch
                ]
            },
        )
        if not body.get("status"):
            raise RuntimeError(body.get("message") or "charges estimate refused")
        per_order = (body.get("data") or {}).get("charges") or []
        # The estimator answers in request order. If the counts disagree, nothing can be matched
        # to an order safely, and a wrong charge is worse than a missing one.
        if len(per_order) != len(batch):
            raise RuntimeError("charges estimate did not return one entry per order")
        for (oid, _), c in zip(batch, per_order):
            breakup = c.get("breakup") or []
            total = c.get("total_charges")
            total = float(total) if total is not None else sum(float(b.get("amount") or 0) for b in breakup)
            out[oid] = {"brokerage": round(_brokerage_of(breakup), 4), "total": round(total, 4)}
    return out


@app.get("/api/trades")
def trades(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """
    Today's fills, exactly as SmartAPI returns them, plus each order's brokerage and charges.
    The frontend does the FIFO lot matching and splits the charges onto lots.

    SmartAPI has no historical trade endpoint, so this is the current session only and an empty
    list outside market hours is the correct answer, not an error.

    Charges are best effort: if the estimator fails, `charges` is null and `charges_error` says
    why, and the fills still come back — a sync must never fail over a fee.
    """
    _require_user(authorization)

    if not _broker_ready():
        raise HTTPException(
            503,
            "Broker credentials are not configured on the server — set SMARTAPI_CLIENT_CODE, "
            "SMARTAPI_MPIN and SMARTAPI_TOTP_SECRET in the backend environment",
        )

    try:
        body = _smartapi("GET", TRADE_BOOK_PATH)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, f"SmartAPI trade book failed: {exc}") from exc

    if not body.get("status"):
        raise HTTPException(502, body.get("message") or "SmartAPI returned an error")

    fills: list[dict[str, Any]] = body.get("data") or []

    charges: dict[str, dict[str, float]] | None = None
    charges_error: str | None = None
    if fills:
        try:
            charges = _order_charges(fills)
        except HTTPException as exc:
            charges_error = f"Charges unavailable: {exc.detail}"
        except (httpx.HTTPError, ValueError, RuntimeError, TypeError, KeyError) as exc:
            charges_error = f"Charges unavailable: {exc}"

    return {"fills": fills, "charges": charges, "charges_error": charges_error}

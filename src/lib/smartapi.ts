/**
 * Talks to the FastAPI broker proxy in `backend/`, never to Angel One directly.
 *
 * The credentials and the TOTP seed live on the server. They must not be `VITE_*` values: Vite
 * compiles those into the JavaScript bundle, so shipping an MPIN and TOTP seed would publish the
 * second factor of a live trading account to anyone who opens the site.
 *
 * In dev, `VITE_API_BASE` can be left unset — Vite proxies `/api` to http://127.0.0.1:8000.
 * A deployed build must set it to the proxy's public URL.
 */
import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "/api" : "");

/** One fill as SmartAPI returns it, passed straight through by the proxy. */
export interface SmartApiFill {
  exchange: string;
  producttype: string;
  tradingsymbol: string;
  instrumenttype: string;
  symbolgroup: string;
  strikeprice: string;
  optiontype: string;
  expirydate: string;
  marketlot: string;
  precision: string;
  multiplier: string;
  tradevalue: string;
  transactiontype: string;
  fillprice: string;
  fillsize: string;
  orderid: string;
  fillid: string;
  filltime: string;
}

/** Whether a backend URL is known. False in a deployed build with no VITE_API_BASE set. */
export function brokerConfigured(): boolean {
  return Boolean(API_BASE);
}

/** The proxy answers with JSON; anything else means it is down or a wrong URL was configured. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.status === 404
        ? "Broker proxy not found — is the FastAPI service running, and is VITE_API_BASE right?"
        : `Broker proxy replied with ${res.status}, not JSON.`
    );
  }
}

/**
 * Today's fills. SmartAPI has no historical trade endpoint, so this is the current session only
 * and an empty list outside market hours is the correct answer, not an error.
 */
export async function fetchTradeBook(): Promise<SmartApiFill[]> {
  if (!API_BASE) {
    throw new Error("No backend URL — set VITE_API_BASE to your deployed FastAPI service.");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in first — the broker proxy requires your session.");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/trades`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Could not reach the broker proxy — is it running?");
  }

  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(typeof body.detail === "string" ? body.detail : `Proxy error ${res.status}`);
  }
  return (body.fills as SmartApiFill[] | undefined) ?? [];
}

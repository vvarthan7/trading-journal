/**
 * Time-based one-time passwords (RFC 6238). SmartAPI's login is TOTP-gated, so every session
 * needs the six digits that Angel One's base32 secret produces for the current 30-second step.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** Base32 (RFC 4648) without padding — the shape Angel One hands out when 2FA is enabled. */
function base32Decode(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/[=\s-]/g, "");
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;

  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index === -1) {
      throw new Error(`"${ch}" is not base32 — check VITE_SMARTAPI_TOTP_SECRET`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }

  if (bytes.length === 0) throw new Error("VITE_SMARTAPI_TOTP_SECRET is empty");
  return new Uint8Array(bytes);
}

/** The counter as the 8-byte big-endian block HMAC expects, without needing BigInt. */
function counterBlock(counter: number): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  return buf;
}

/** The current six-digit code for `secret`. `at` is a ms timestamp, for tests. */
export async function generateTotp(secret: string, at: number = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBlock(counter)));

  // Dynamic truncation: the low nibble of the last byte picks the 4-byte window to read.
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];

  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

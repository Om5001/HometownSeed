import { NextResponse } from "next/server";
import { AuthError, getUser, type User } from "./auth";

export const ok = (data: unknown, init: ResponseInit = {}) => NextResponse.json(data, init);
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Please sign in first.");
  return u;
}

/** Wrap a route handler: turns HttpError into JSON errors and hides internals. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      const req = args[0];
      if (req instanceof Request && req.method !== "GET" && !sameOrigin(req)) return fail("Cross-site request blocked.", 403);
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError || e instanceof AuthError) return fail(e.message, e.status);
      console.error(e);
      return fail("Something went wrong. Please try again.", 500);
    }
  };
}

export const ZIP_RE = /^\d{5}$/;
export const cleanZips = (v: unknown): string[] =>
  Array.from(new Set((Array.isArray(v) ? v : []).map((z) => String(z).trim().padStart(5, "0")).filter((z) => ZIP_RE.test(z)))).slice(0, 200);

export const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Blocks cross-site form posts (CSRF). Uses the browser's Sec-Fetch-Site label,
 *  which works behind proxies (Codespaces, Vercel) that rewrite the Host header. */
function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")].filter(Boolean);
  try { return hosts.includes(new URL(origin).host); } catch { return false; }
}

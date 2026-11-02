import { NextResponse } from "next/server";
import { AuthError, getUser, type User } from "./auth";

export const ok = (data: unknown, init: ResponseInit = {}) => NextResponse.json(data, init);
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(opts: { verified?: boolean } = {}): Promise<User> {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Please sign in first.");
  if (opts.verified && !u.email_verified) throw new HttpError(403, "Confirm your email first. Check your inbox for the link, or resend it from the banner at the top.");
  return u;
}

/** The site's public address, for links in emails. In production it must come from
 *  NEXT_PUBLIC_SITE_URL, so a forged Host/Origin header can't redirect reset links. */
export function siteUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production") throw new HttpError(500, "Set NEXT_PUBLIC_SITE_URL to the site's address.");
  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
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
      const code = (e as { code?: string }).code;
      if (code === "42P01" || code === "42703" || code === "42883")
        return fail("The database is missing the latest setup. Stop the site and run: npm run migrate", 500);
      if (process.env.NODE_ENV !== "production") return fail("Server error: " + ((e as Error).message || String(e)), 500);
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

/** Blocks cross-site form posts (CSRF). Browsers label every request with Sec-Fetch-Site;
 *  that works behind proxies (Codespaces, Vercel) that rewrite the Host header. */
function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")].filter(Boolean);
  try { return hosts.includes(new URL(origin).host); } catch { return false; }
}

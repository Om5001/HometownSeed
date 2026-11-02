/**
 * Email + password sign-in with server-side sessions.
 * - Passwords: scrypt (N=16384, r=8, p=1) with a per-user salt.
 * - Sessions: a random token in an httpOnly cookie; only its SHA-256 is stored.
 * - Rate limit: 8 failed attempts per email per 15 minutes.
 * Next step before public launch: email verification + password reset (needs an email provider).
 */
import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export type User = { id: string; email: string; display_name: string };
const COOKIE = "hs_session";
const SESSION_DAYS = 30;
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: +n, r: +r, p: +p });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
export const passwordProblem = (pw: string) =>
  typeof pw !== "string" || pw.length < 8 ? "Use a password of at least 8 characters." : pw.length > 200 ? "That password is too long." : null;

async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db()`insert into sessions (token_hash, user_id, expires_at, user_agent)
             values (${sha(token)}, ${userId}, now() + ${SESSION_DAYS + " days"}::interval, ${ua})`;
  await db()`update app_users set last_login_at = now() where id = ${userId}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function signUp(email: string, password: string, name: string): Promise<User> {
  const clean = email.trim().toLowerCase();
  if (!validEmail(clean)) throw new AuthError(400, "Enter a valid email.");
  const bad = passwordProblem(password); if (bad) throw new AuthError(400, bad);
  const display = name.trim().slice(0, 60);
  if (display.length < 2) throw new AuthError(400, "Enter your name.");
  const hash = await hashPassword(password);
  // A legacy prototype account (no password yet) can be claimed by setting one.
  const [u] = await db()<User[]>`
    insert into app_users (email, display_name, password_hash) values (${clean}, ${display}, ${hash})
    on conflict ((lower(email))) do update set password_hash = excluded.password_hash, display_name = excluded.display_name
      where app_users.password_hash is null
    returning id, email, display_name`;
  if (!u) throw new AuthError(409, "An account with that email already exists. Sign in instead.");
  await startSession(u.id);
  return u;
}

export async function signIn(email: string, password: string): Promise<User> {
  const clean = email.trim().toLowerCase();
  const [{ fails }] = await db()<{ fails: number }[]>`
    select count(*)::int as fails from login_attempts
    where lower(email) = ${clean} and not ok and at > now() - interval '15 minutes'`;
  if (fails >= 8) throw new AuthError(429, "Too many attempts. Wait 15 minutes and try again.");
  const [u] = await db()<(User & { password_hash: string | null })[]>`
    select id, email, display_name, password_hash from app_users where lower(email) = ${clean}`;
  const ok = !!u && (await verifyPassword(password, u.password_hash));
  await db()`insert into login_attempts (email, ok) values (${clean}, ${ok})`;
  if (!ok) {
    if (u && !u.password_hash) throw new AuthError(401, "This account doesn't have a password yet. Use Create account with the same email to set one.");
    throw new AuthError(401, "Email or password is incorrect.");
  }
  await startSession(u.id);
  return { id: u.id, email: u.email, display_name: u.display_name };
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [u] = await db()<User[]>`
    select u.id, u.email, u.display_name from sessions s join app_users u on u.id = s.user_id
    where s.token_hash = ${sha(token)} and s.expires_at > now()`;
  return u ?? null;
}

/** For pages: send signed-out visitors to sign-in, then back. */
export async function requirePageUser(next: string): Promise<User> {
  const u = await getUser();
  if (!u) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return u;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db()`delete from sessions where token_hash = ${sha(token)}`;
  jar.delete(COOKIE);
}

/**
 * Accounts: sign-up, sign-in, sessions, email verification, password reset, deletion.
 *
 * Passwords
 * - Argon2id (memory-hard, the current OWASP / RFC 9106 recommendation): 64 MiB, 3 passes,
 *   4 lanes, about 0.2 s per guess on a server, so offline cracking is slow and expensive.
 * - Optional pepper: set AUTH_PEPPER (a long random secret kept outside the database) and a
 *   stolen database alone can't be cracked. Never change it once set, or every password breaks.
 * - Old scrypt hashes are upgraded to Argon2id automatically on the next sign-in.
 *
 * Guessing protection ("smart lockout")
 * - After 4 failed attempts on an account, each new attempt waits 1, 2, 4, 8, 15 s.
 * - After 10 failures in 15 minutes the account is locked for 15 minutes.
 * - More than 50 failures from one IP in 15 minutes blocks that IP for 15 minutes.
 * - Unknown emails take the same time as known ones, so attackers can't tell which exist.
 *
 * Sessions: random 256-bit token in an httpOnly cookie; only its SHA-256 is stored.
 * Changing or resetting a password signs out every other device.
 */
import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { db } from "./db";
import { resetPasswordMessage, sendEmail, verifyEmailMessage, type SendResult } from "./email";

export type User = { id: string; email: string; display_name: string; email_verified: boolean };
const COOKIE = "hs_session";
const SESSION_DAYS = 30;
const ARGON = { memoryCost: 65536, timeCost: 3, parallelism: 4 } as const; // library default algorithm = Argon2id
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, o: crypto.ScryptOptions) => Promise<Buffer>;

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const pepper = () => (process.env.AUTH_PEPPER ? Buffer.from(process.env.AUTH_PEPPER) : undefined);

export async function hashPassword(pw: string): Promise<string> {
  return argonHash(pw, { ...ARGON, secret: pepper() });
}

/** Returns whether the password matches, and whether the stored hash should be upgraded. */
export async function verifyPassword(pw: string, stored: string | null): Promise<{ ok: boolean; rehash: boolean }> {
  if (!stored) return { ok: false, rehash: false };
  if (stored.startsWith("$argon2")) {
    const ok = await argonVerify(stored, pw, { secret: pepper() }).catch(() => false);
    return { ok, rehash: ok && !stored.includes(`m=${ARGON.memoryCost},t=${ARGON.timeCost},p=${ARGON.parallelism}`) };
  }
  if (stored.startsWith("scrypt$")) { // legacy hashes from the first prototype
    const [, n, r, p, salt, hash] = stored.split("$");
    const want = Buffer.from(hash, "base64");
    const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: +n, r: +r, p: +p });
    const ok = got.length === want.length && crypto.timingSafeEqual(got, want);
    return { ok, rehash: ok };
  }
  return { ok: false, rehash: false };
}

let dummyHash: Promise<string> | null = null;
const burnTime = async (pw: string) => { dummyHash ??= hashPassword("not-a-real-password-" + crypto.randomUUID()); await verifyPassword(pw, await dummyHash); };

const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "iloveyou1", "letmein123", "welcome123", "admin1234", "abc123456", "passw0rd", "football1", "baseball1", "sunshine1", "princess1",
  "trustno1!", "11111111", "00000000", "hometownseed", "trumpaccount", "trumpaccounts"]);

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

export function passwordProblem(pw: unknown, email = ""): string | null {
  if (typeof pw !== "string" || pw.length < 10) return "Use a password of at least 10 characters. A short phrase works well.";
  if (pw.length > 200) return "That password is too long (200 characters max).";
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return "That password is too common. Pick something less guessable.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && low.includes(local)) return "Don't use your email address in your password.";
  if (/^(.)\1+$/.test(pw)) return "That password is too easy to guess.";
  return null;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim().slice(0, 64);
}

/** Smart lockout: returns how long to wait before checking this attempt (ms), or throws when locked. */
async function throttle(email: string, ip: string): Promise<number> {
  const [r] = await db()<{ by_email: number; by_ip: number }[]>`
    select (select count(*)::int from login_attempts where lower(email) = ${email} and not ok and at > now() - interval '15 minutes') as by_email,
           (select count(*)::int from login_attempts where ip = ${ip} and not ok and at > now() - interval '15 minutes') as by_ip`;
  if (r.by_ip >= 50) throw new AuthError(429, "Too many sign-in attempts from your network. Try again in 15 minutes.");
  if (r.by_email >= 10) throw new AuthError(429, "This account is locked for 15 minutes after too many wrong passwords. You can reset your password instead.");
  return r.by_email >= 4 ? Math.min(1000 * 2 ** (r.by_email - 4), 15000) : 0;
}

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

async function newToken(userId: string, purpose: "verify_email" | "reset_password", ttl: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db()`insert into auth_tokens (token_hash, user_id, purpose, expires_at) values (${sha(token)}, ${userId}, ${purpose}, now() + ${ttl}::interval)`;
  return token;
}

async function consumeToken(token: string, purpose: string): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [t] = await db()<{ user_id: string }[]>`
    update auth_tokens set used_at = now()
    where token_hash = ${sha(token)} and purpose = ${purpose} and used_at is null and expires_at > now()
    returning user_id`;
  return t?.user_id ?? null;
}

const userCols = (sql: ReturnType<typeof db>) => sql`id, email, display_name, (email_verified_at is not null) as email_verified`;

// --- Sign-up / sign-in -------------------------------------------------------------

export async function signUp(email: string, password: string, name: string, baseUrl: string): Promise<{ user: User; email: SendResult }> {
  const clean = email.trim().toLowerCase();
  if (!validEmail(clean)) throw new AuthError(400, "Enter a valid email.");
  const display = name.trim().slice(0, 60);
  if (display.length < 2) throw new AuthError(400, "Enter your name.");
  const bad = passwordProblem(password, clean); if (bad) throw new AuthError(400, bad);
  const hash = await hashPassword(password);
  const sql = db();
  // A legacy prototype account with no password can be claimed; it still has to verify its email.
  const [u] = await sql<User[]>`
    insert into app_users (email, display_name, password_hash, password_changed_at) values (${clean}, ${display}, ${hash}, now())
    on conflict ((lower(email))) do update set password_hash = excluded.password_hash, display_name = excluded.display_name,
      password_changed_at = now(), email_verified_at = null
      where app_users.password_hash is null
    returning ${userCols(sql)}`;
  if (!u) throw new AuthError(409, "An account with that email already exists. Sign in, or reset your password.");
  await startSession(u.id);
  return { user: u, email: await sendVerification(u, baseUrl) };
}

export async function signIn(email: string, password: string): Promise<User> {
  const clean = email.trim().toLowerCase().slice(0, 200);
  const ip = await clientIp();
  const wait = await throttle(clean, ip);
  if (wait) await sleep(wait);
  const sql = db();
  const [u] = await sql<(User & { password_hash: string | null })[]>`
    select ${userCols(sql)}, password_hash from app_users where lower(email) = ${clean}`;
  let res = { ok: false, rehash: false };
  if (u?.password_hash) res = await verifyPassword(String(password ?? ""), u.password_hash);
  else await burnTime(String(password ?? ""));
  await sql`insert into login_attempts (email, ok, ip) values (${clean}, ${res.ok}, ${ip})`;
  if (!res.ok) {
    if (u && !u.password_hash) throw new AuthError(401, "This account doesn't have a password yet. Use Create account with the same email to set one.");
    throw new AuthError(401, "Email or password is incorrect.");
  }
  if (res.rehash) await sql`update app_users set password_hash = ${await hashPassword(password)} where id = ${u.id}`;
  await startSession(u.id);
  return { id: u.id, email: u.email, display_name: u.display_name, email_verified: u.email_verified };
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sql = db();
  const [u] = await sql<User[]>`
    select ${sql`u.id, u.email, u.display_name, (u.email_verified_at is not null) as email_verified`}
    from sessions s join app_users u on u.id = s.user_id
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

export async function signOutEverywhere(user: User) {
  await db()`delete from sessions where user_id = ${user.id}`;
  (await cookies()).delete(COOKIE);
}

// --- Email verification ------------------------------------------------------------

export async function sendVerification(user: User, baseUrl: string): Promise<SendResult> {
  const [{ n }] = await db()<{ n: number }[]>`
    select count(*)::int as n from auth_tokens where user_id = ${user.id} and purpose = 'verify_email' and created_at > now() - interval '1 hour'`;
  if (n >= 5) throw new AuthError(429, "We've sent several emails already. Check your inbox and spam folder, or try again in an hour.");
  const token = await newToken(user.id, "verify_email", "24 hours");
  return sendEmail({ to: user.email, ...verifyEmailMessage(user.display_name, `${baseUrl}/verify?token=${token}`) });
}

/** Confirms an email. Safe to call twice: a link that was already used for an
 *  already-confirmed address still counts as success (email scanners and double clicks). */
export async function verifyEmailToken(token: string): Promise<"ok" | "invalid"> {
  if (!token || token.length > 100) return "invalid";
  const sql = db();
  const userId = await consumeToken(token, "verify_email");
  if (userId) {
    await sql`update app_users set email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
    return "ok";
  }
  const [t] = await sql<{ verified: boolean }[]>`
    select u.email_verified_at is not null as verified from auth_tokens t join app_users u on u.id = t.user_id
    where t.token_hash = ${sha(token)} and t.purpose = 'verify_email'`;
  return t?.verified ? "ok" : "invalid";
}

// --- Password reset / change -------------------------------------------------------

export async function requestPasswordReset(email: string, baseUrl: string): Promise<SendResult | null> {
  const clean = email.trim().toLowerCase();
  const sql = db();
  const [u] = await sql<User[]>`select ${userCols(sql)} from app_users where lower(email) = ${clean} and password_hash is not null`;
  if (!u) { await sleep(150 + Math.random() * 100); return null; }  // same timing either way; never reveal if the email exists
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from auth_tokens where user_id = ${u.id} and purpose = 'reset_password' and created_at > now() - interval '1 hour'`;
  if (n >= 5) return null;
  const token = await newToken(u.id, "reset_password", "1 hour");
  return sendEmail({ to: u.email, ...resetPasswordMessage(u.display_name, `${baseUrl}/reset?token=${token}`) });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const sql = db();
  const [peek] = await sql<{ email: string }[]>`
    select u.email from auth_tokens t join app_users u on u.id = t.user_id
    where t.token_hash = ${sha(token)} and t.purpose = 'reset_password' and t.used_at is null and t.expires_at > now()`;
  if (!peek) throw new AuthError(400, "This reset link has expired or was already used. Ask for a new one.");
  const bad = passwordProblem(password, peek.email); if (bad) throw new AuthError(400, bad);
  const userId = await consumeToken(token, "reset_password");
  if (!userId) throw new AuthError(400, "This reset link has expired or was already used. Ask for a new one.");
  // Clicking the emailed link also proves the address.
  await sql`update app_users set password_hash = ${await hashPassword(password)}, password_changed_at = now(),
            email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
  await sql`delete from sessions where user_id = ${userId}`;
  await sql`delete from login_attempts where lower(email) = lower(${peek.email})`;  // lift any lockout
  await startSession(userId);
}

export async function changePassword(user: User, current: string, next: string) {
  const sql = db();
  const [u] = await sql<{ password_hash: string | null }[]>`select password_hash from app_users where id = ${user.id}`;
  if (!(await verifyPassword(current, u?.password_hash ?? null)).ok) throw new AuthError(401, "Your current password is incorrect.");
  const bad = passwordProblem(next, user.email); if (bad) throw new AuthError(400, bad);
  await sql`update app_users set password_hash = ${await hashPassword(next)}, password_changed_at = now() where id = ${user.id}`;
  await sql`delete from sessions where user_id = ${user.id}`;
  await startSession(user.id);
}

// --- Account deletion --------------------------------------------------------------

export async function deleteAccount(user: User, password: string) {
  const sql = db();
  const [u] = await sql<{ password_hash: string | null }[]>`select password_hash from app_users where id = ${user.id}`;
  if (u?.password_hash && !(await verifyPassword(password, u.password_hash)).ok) throw new AuthError(401, "That password is incorrect.");
  // Coalitions this person was signing in: everyone left gets a fresh agreement
  const pools = await sql<{ id: string; status: string }[]>`
    select p.id, p.status from pools p where p.status in ('confirmed', 'approved', 'rejected')
      and exists (select 1 from coalition_people(p.id) x where x.user_id = ${user.id})`;
  await sql`select delete_account(${user.id})`;
  if (pools.length) await (await import("./coalition")).redrawAfterDeparture(pools);
  (await cookies()).delete(COOKIE);
}

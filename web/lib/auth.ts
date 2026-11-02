/**
 * PROTOTYPE sign-in: email + name, stored in a signed cookie. No passwords.
 * Replace with Supabase Auth (magic link / OAuth) before taking real money:
 * keep getUser()'s return shape and the rest of the app does not change.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

export type User = { id: string; email: string; display_name: string };
const COOKIE = "hs_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ characters)");
  return s;
}
const sign = (v: string) => v + "." + crypto.createHmac("sha256", secret()).update(v).digest("base64url");
function verify(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const v = token.slice(0, i);
  const a = Buffer.from(sign(v)), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? v : null;
}

export async function getUser(): Promise<User | null> {
  const id = verify((await cookies()).get(COOKIE)?.value);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [u] = await db()<User[]>`select id, email, display_name from app_users where id = ${id}`;
  return u ?? null;
}

export async function signIn(email: string, name: string): Promise<User> {
  const clean = email.trim().toLowerCase();
  const [u] = await db()<User[]>`
    insert into app_users (email, display_name) values (${clean}, ${name.trim()})
    on conflict ((lower(email))) do update set display_name = coalesce(nullif(excluded.display_name, ''), app_users.display_name)
    returning id, email, display_name`;
  (await cookies()).set(COOKIE, sign(u.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return u;
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

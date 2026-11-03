import { db } from "@/lib/db";
import { fail, handle, ok, requireUser } from "@/lib/http";

/** Update display name and/or "I represent a 501(c)(3)". */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json().catch(() => ({}));
  if ("has_nonprofit" in b) await db()`update app_users set has_nonprofit = ${b.has_nonprofit === true} where id = ${user.id}`;
  if ("name" in b) {
    const display = String(b.name || "").trim().slice(0, 60);
    if (display.length < 2) return fail("Enter your name.");
    await db()`update app_users set display_name = ${display} where id = ${user.id}`;
  }
  return ok({ ok: true });
});

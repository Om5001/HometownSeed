import { db } from "@/lib/db";
import { fail, handle, ok, requireUser } from "@/lib/http";

/** Update display name. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { name } = await req.json().catch(() => ({}));
  const display = String(name || "").trim().slice(0, 60);
  if (display.length < 2) return fail("Enter your name.");
  await db()`update app_users set display_name = ${display} where id = ${user.id}`;
  return ok({ ok: true });
});

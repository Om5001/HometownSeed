import { changePassword } from "@/lib/auth";
import { handle, ok, requireUser } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { current, next } = await req.json().catch(() => ({}));
  await changePassword(user, String(current || ""), String(next || ""));
  return ok({ ok: true });
});

import { changePassword } from "@/lib/auth";
import { handle, ok, requireUser, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { current, next } = await readJson(req);
  await changePassword(user, String(current || ""), String(next || ""));
  return ok({ ok: true });
});

import { resetPassword } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { token, password } = await readJson(req);
  await resetPassword(String(token || ""), String(password || ""));
  return ok({ ok: true });
});

import { resetPassword } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { token, password } = await req.json().catch(() => ({}));
  await resetPassword(String(token || ""), String(password || ""));
  return ok({ ok: true });
});

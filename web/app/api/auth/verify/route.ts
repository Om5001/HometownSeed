import { verifyEmailToken } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { token } = await req.json().catch(() => ({}));
  const r = await verifyEmailToken(String(token || ""));
  return r === "ok" ? ok({ ok: true }) : fail("This link has expired or isn't valid. Sign in and use “Resend email” in the banner.", 400);
});

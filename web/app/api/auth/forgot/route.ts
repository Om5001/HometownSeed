import { requestPasswordReset } from "@/lib/auth";
import { handle, ok, siteUrl } from "@/lib/http";

/** Always answers the same way, so it can't be used to find out who has an account. */
export const POST = handle(async (req: Request) => {
  const { email } = await req.json().catch(() => ({}));
  const r = await requestPasswordReset(String(email || "").slice(0, 200), siteUrl(req));
  const devLink = r && !r.sent && (process.env.NODE_ENV !== "production" || process.env.EMAIL_DEV_LINKS === "1") ? r.devLink : undefined;
  return ok({ ok: true, devLink });
});

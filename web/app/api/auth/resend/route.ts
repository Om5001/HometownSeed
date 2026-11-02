import { sendVerification } from "@/lib/auth";
import { fail, handle, ok, requireUser, siteUrl } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (user.email_verified) return fail("Your email is already confirmed.");
  return ok({ verification: await sendVerification(user, siteUrl(req)) });
});

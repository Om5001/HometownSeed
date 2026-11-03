import { signUp } from "@/lib/auth";
import { handle, ok, siteUrl } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, password, name, hasNonprofit } = await req.json().catch(() => ({}));
  const { user, email: sent } = await signUp(String(email || ""), String(password || ""), String(name || ""), siteUrl(req), hasNonprofit === true);
  return ok({ user, verification: sent }, { status: 201 });
});

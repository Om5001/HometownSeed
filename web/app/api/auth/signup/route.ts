import { signUp } from "@/lib/auth";
import { handle, ok, siteUrl, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, password, name, hasNonprofit } = await readJson(req);
  const { user, email: sent } = await signUp(String(email || ""), String(password || ""), String(name || ""), siteUrl(req), hasNonprofit === true);
  return ok({ user, verification: sent }, { status: 201 });
});

import { signIn } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, password } = await readJson(req);
  const user = await signIn(String(email || ""), String(password || ""));
  return ok({ user });
});

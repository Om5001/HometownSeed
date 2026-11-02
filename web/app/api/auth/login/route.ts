import { signIn } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, password } = await req.json().catch(() => ({}));
  const user = await signIn(String(email || ""), String(password || ""));
  return ok({ user });
});

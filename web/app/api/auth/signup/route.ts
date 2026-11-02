import { signUp } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, password, name } = await req.json().catch(() => ({}));
  const user = await signUp(String(email || ""), String(password || ""), String(name || ""));
  return ok({ user }, { status: 201 });
});

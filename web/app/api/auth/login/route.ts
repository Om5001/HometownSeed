import { signIn } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, name } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail("Enter a valid email.");
  const display = typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : email.split("@")[0];
  const user = await signIn(email, display);
  return ok({ user });
});

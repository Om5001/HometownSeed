import { signOutEverywhere } from "@/lib/auth";
import { handle, ok, requireUser } from "@/lib/http";

export const POST = handle(async () => {
  await signOutEverywhere(await requireUser());
  return ok({ ok: true });
});

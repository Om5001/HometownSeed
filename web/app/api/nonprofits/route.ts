import { handle, ok, requireUser, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";
import { registerNonprofit } from "@/lib/nonprofits";

/** "I represent this 501(c)(3)." */
export const POST = handle(async (req: Request) => {
  const user = await requireUser({ verified: true });
  const r = await registerNonprofit(user, await readJson(req));
  await audit(user.id, "nonprofit.register", "nonprofit", r.id, r);
  return ok(r, { status: 201 });
});

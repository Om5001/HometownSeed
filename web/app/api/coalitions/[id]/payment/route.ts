import { handle, ok, requireUser, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";
import { recordPayment } from "@/lib/treasury";

/** Record the charity's ACH/wire payment to Treasury (step 4). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const r = await recordPayment(user, id, await readJson(req));
  await audit(user.id, "treasury.payment", "pool", id, r);
  return ok(r);
});

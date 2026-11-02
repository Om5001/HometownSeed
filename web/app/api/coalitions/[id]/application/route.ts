import { handle, ok, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";
import { prepareApplication } from "@/lib/treasury";

/** Fill in (or update) the Treasury application from the signed coalition agreement. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const r = await prepareApplication(user, id, await req.json().catch(() => ({})));
  await audit(user.id, "treasury.prepare", "pool", id, r);
  return ok(r);
});

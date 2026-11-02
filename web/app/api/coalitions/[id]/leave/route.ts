import { leaveCoalition, notifySigners } from "@/lib/coalition";
import { fail, handle, ok, requireUser, siteUrl } from "@/lib/http";
import { audit } from "@/lib/queries";

/** Leave a coalition instead of signing: your pledges are withdrawn and campaigns you own leave with you. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (b.confirm !== true) return fail("Confirm that you want to leave.");
  const r = await leaveCoalition(user, id);
  await audit(user.id, "coalition.leave", "pool", id, r);
  if (r.newAgreement) await notifySigners(id, siteUrl(req));
  return ok(r);
});

import { notifySigners, removeCampaign } from "@/lib/coalition";
import { fail, handle, ok, requireUser, siteUrl, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";

/** An organizer takes their campaign out of its coalition (before it goes to Treasury). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser({ verified: true });
  const { slug } = await ctx.params;
  const b = await readJson(req);
  if (b.confirm !== true) return fail("Confirm that you want to take this campaign out of the coalition.");
  const r = await removeCampaign(user, slug);
  await audit(user.id, "coalition.remove_campaign", "campaign", slug, r);
  if (r.newAgreement) await notifySigners(r.poolId, siteUrl(req));
  return ok(r);
});

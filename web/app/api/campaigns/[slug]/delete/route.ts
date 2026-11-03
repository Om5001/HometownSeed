import { deleteCampaign, notifySigners } from "@/lib/coalition";
import { fail, handle, ok, requireUser, siteUrl, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";

/** The owner deletes a campaign (and its pledges, which are promises only) before it goes to Treasury. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser({ verified: true });
  const { slug } = await ctx.params;
  const b = await readJson(req);
  if (String(b.confirm ?? "").trim().toLowerCase() !== "delete") return fail("Type DELETE to confirm.");
  const r = await deleteCampaign(user, slug);
  await audit(user.id, "campaign.delete", "campaign", slug, r);
  if ("newAgreement" in r && r.newAgreement && "poolId" in r) await notifySigners(r.poolId as string, siteUrl(req));
  return ok(r);
});

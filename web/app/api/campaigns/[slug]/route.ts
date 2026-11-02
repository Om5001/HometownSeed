import { getUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/http";
import { getCampaign, memberRole } from "@/lib/queries";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const data = await getCampaign(slug);
  if (!data) return fail("Campaign not found.", 404);
  const user = await getUser();
  const role = await memberRole(data.campaign.id, user?.id);
  // invite code is only visible to organizers
  const campaign = role ? data.campaign : { ...data.campaign, invite_code: undefined };
  return ok({ ...data, campaign, viewer: { user, role } });
});

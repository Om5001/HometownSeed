import { confirmCoalition } from "@/lib/coalition";
import { handle, ok, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";

/** "We're ready": confirm this campaign for its coalition (step 2 of the tracker). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser({ verified: true });
  const { slug } = await ctx.params;
  const r = await confirmCoalition(user, slug);
  await audit(user.id, "coalition.confirm", "campaign", slug, r);
  return ok(r);
});

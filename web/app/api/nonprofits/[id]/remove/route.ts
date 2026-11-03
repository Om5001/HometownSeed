import { handle, ok, requireUser } from "@/lib/http";
import { removeNonprofit } from "@/lib/nonprofits";

/** Stop representing a nonprofit on Hometown Seed. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return ok(await removeNonprofit(user, id));
});

import { db } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";
import { findMatches } from "@/lib/queries";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const [c] = await db()<{ id: string; zctas: string[]; goal: number; min_age: number; max_age: number }[]>`
    select id, zctas, goal_cents::float8 as goal, min_age, max_age from v_campaign_stats where slug = ${slug}`;
  if (!c) return fail("Campaign not found.", 404);
  return ok(await findMatches(c.zctas, c.goal, c.min_age, c.max_age, c.id, 6));
});

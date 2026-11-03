import { db } from "@/lib/db";
import { fail, handle, ok, requireUser, readJson } from "@/lib/http";
import { memberRole } from "@/lib/queries";

/** Organizers switch matching and friend invites on or off. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser({ verified: true });
  const { slug } = await ctx.params;
  const b = await readJson(req);
  const [c] = await db()<{ id: string }[]>`select id from campaigns where slug = ${slug}`;
  if (!c) return fail("Campaign not found.", 404);
  if (!(await memberRole(c.id, user.id))) return fail("Only organizers can change this.", 403);
  await db()`update campaigns set open_to_matching = ${!!b.open_to_matching}, invite_friends = ${!!b.invite_friends},
             mode = ${b.open_to_matching ? "match" : b.invite_friends ? "friends" : "solo"}, updated_at = now() where id = ${c.id}`;
  return ok({ ok: true });
});

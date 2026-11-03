import { db } from "@/lib/db";
import { fail, handle, HttpError, ok, requireUser, readJson } from "@/lib/http";
import { audit, memberRole } from "@/lib/queries";

/** Ask another campaign to pool into one Treasury contribution. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser({ verified: true });
  const { slug } = await ctx.params;
  const b = await readJson(req);
  const sql = db();
  const rows = await sql<{ id: string; slug: string; min_age: number; max_age: number; pool_id: string | null; status: string; open_to_matching: boolean }[]>`
    select id, slug, min_age, max_age, pool_id, status, open_to_matching from campaigns where slug in (${slug}, ${String(b.toSlug || "")})`;
  const from = rows.find((r) => r.slug === slug), to = rows.find((r) => r.slug === b.toSlug);
  if (!from || !to) return fail("Campaign not found.", 404);
  if (from.id === to.id) return fail("That's the same campaign.");
  if (!(await memberRole(from.id, user.id))) throw new HttpError(403, "Only organizers can request to pool.");
  if (from.min_age !== to.min_age || from.max_age !== to.max_age)
    return fail("These campaigns fund different age groups, so Treasury would treat them as different classes. Match the age group first.");
  if (from.pool_id && from.pool_id === to.pool_id) return fail("You're already pooled together.");
  if (!from.open_to_matching) return fail("Your campaign is set to run on its own. Turn on matching in its settings first.");
  if (!to.open_to_matching) return fail("That campaign is running on its own and isn't taking pool requests.");
  if (to.status !== "active") return fail("That campaign isn't active.");
  const [r] = await sql<{ id: string }[]>`
    insert into pool_requests (from_campaign, to_campaign, requested_by, message)
    values (${from.id}, ${to.id}, ${user.id}, ${String(b.message || "").slice(0, 280) || null})
    on conflict do nothing returning id`;
  if (!r) return fail("There's already an open request between these campaigns.");
  await audit(user.id, "pool.request", "pool_request", r.id, { from: slug, to: to.slug });
  return ok({ id: r.id }, { status: 201 });
});

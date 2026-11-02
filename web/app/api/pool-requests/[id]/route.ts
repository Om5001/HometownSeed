import { db } from "@/lib/db";
import { fail, handle, HttpError, ok, requireUser } from "@/lib/http";
import { audit, memberRole } from "@/lib/queries";

/** Accept, decline, or withdraw a pooling request. Accepting merges both campaigns into one pool. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { action } = await req.json().catch(() => ({}));
  if (!["accept", "decline", "withdraw"].includes(action)) return fail("Unknown action.");
  const sql = db();
  const [r] = await sql<{ id: string; from_campaign: string; to_campaign: string; status: string }[]>`
    select id, from_campaign, to_campaign, status from pool_requests where id = ${id}`;
  if (!r || r.status !== "pending") return fail("This request is no longer open.", 404);
  const side = action === "withdraw" ? r.from_campaign : r.to_campaign;
  if (!(await memberRole(side, user.id))) throw new HttpError(403, "Only that campaign's organizers can do this.");

  if (action !== "accept") {
    await sql`update pool_requests set status = ${action === "decline" ? "declined" : "withdrawn"}, decided_at = now() where id = ${id}`;
    await audit(user.id, "pool." + action, "pool_request", id);
    return ok({ ok: true });
  }

  const poolId = await sql.begin(async (tx) => {
    const cs = await tx<{ id: string; name: string; pool_id: string | null; min_age: number; max_age: number }[]>`
      select id, name, pool_id, min_age, max_age from campaigns where id in (${r.from_campaign}, ${r.to_campaign}) for update`;
    const a = cs.find((c) => c.id === r.to_campaign)!, b = cs.find((c) => c.id === r.from_campaign)!;
    if (a.min_age !== b.min_age || a.max_age !== b.max_age) throw new HttpError(400, "Age groups no longer match.");
    let pool = a.pool_id ?? b.pool_id;
    if (!pool) {
      [{ id: pool }] = await tx<{ id: string }[]>`
        insert into pools (name, min_age, max_age, created_by) values (${a.name + " + " + b.name}, ${a.min_age}, ${a.max_age}, ${user.id}) returning id`;
    }
    // merge any other pool either side was in
    const other = [a.pool_id, b.pool_id].filter((p) => p && p !== pool) as string[];
    for (const o of other) {
      await tx`update campaigns set pool_id = ${pool} where pool_id = ${o}`;
      await tx`delete from pools where id = ${o}`;
    }
    await tx`update campaigns set pool_id = ${pool}, updated_at = now() where id in (${a.id}, ${b.id})`;
    await tx`update pool_requests set status = 'accepted', decided_at = now() where id = ${id}`;
    return pool;
  });
  await audit(user.id, "pool.accept", "pool", poolId, { request: id });
  return ok({ poolId });
});

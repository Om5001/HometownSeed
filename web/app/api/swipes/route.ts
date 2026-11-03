import { db } from "@/lib/db";
import { fail, handle, ok, requireUser, readJson } from "@/lib/http";

/** Record a like/pass. A like on a person who already liked you = a match. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser({ verified: true });
  const { kind, id, decision } = await readJson(req);
  if (!["campaign", "person"].includes(kind) || !["like", "pass"].includes(decision) || !/^[0-9a-f-]{36}$/.test(String(id)))
    return fail("Bad swipe.");
  if (kind === "person" && id === user.id) return fail("That's you.");
  const sql = db();
  await sql`insert into swipes (user_id, target_kind, target_id, decision) values (${user.id}, ${kind}, ${id}, ${decision})
            on conflict (user_id, target_kind, target_id) do update set decision = excluded.decision, created_at = now()`;
  let matched = false;
  if (kind === "person" && decision === "like") {
    const [m] = await sql`select 1 from swipes where user_id = ${id} and target_kind = 'person' and target_id = ${user.id} and decision = 'like'`;
    matched = !!m;
  }
  return ok({ matched });
});

/** Undo: forget a swipe so the card comes back. */
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser();
  const { kind, id } = await readJson(req);
  await db()`delete from swipes where user_id = ${user.id} and target_kind = ${String(kind)} and target_id = ${String(id)}::uuid`;
  return ok({ ok: true });
});

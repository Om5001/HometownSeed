import { fail, handle, ok, requireUser } from "@/lib/http";
import { blockUser } from "@/lib/messages";

/** Block (or unblock) a person: neither of you can message the other. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Unknown person.", 404);
  const { block } = await req.json().catch(() => ({}));
  return ok(await blockUser(user, id, block !== false));
});

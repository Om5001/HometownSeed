import { handle, ok, requireUser } from "@/lib/http";
import { coalitionChat } from "@/lib/messages";

/** Open the coalition's group chat (created on first use). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  return ok(await coalitionChat(user, id));
});

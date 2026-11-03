import { handle, int, ok, requireUser, siteUrl } from "@/lib/http";
import { getThread, sendMessage } from "@/lib/messages";

/** Messages in a conversation (?after=<id> for only newer ones). Opening it marks it read. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return ok(await getThread(user, id, int(new URL(req.url).searchParams.get("after"), 0, 2 ** 31 - 1, 0)));
});

/** Send a message. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const { body } = await req.json().catch(() => ({}));
  return ok(await sendMessage(user, id, body, siteUrl(req)), { status: 201 });
});

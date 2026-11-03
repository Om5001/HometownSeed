import { handle, ok, requireUser, siteUrl } from "@/lib/http";
import { listConversations, startConversation } from "@/lib/messages";

/** Your conversations, newest first. */
export const GET = handle(async () => ok(await listConversations(await requireUser())));

/** Message a person ({ to }) or a campaign's organizer ({ campaign: slug }). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser({ verified: true });
  const r = await startConversation(user, await req.json().catch(() => ({})), siteUrl(req));
  return ok(r, { status: 201 });
});

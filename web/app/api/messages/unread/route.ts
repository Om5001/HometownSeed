import { getUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { unreadTotal } from "@/lib/messages";

/** Number of unread messages (for the badge in the menu). */
export const GET = handle(async () => {
  const user = await getUser();
  return ok({ unread: user ? await unreadTotal(user.id) : 0 }, { headers: { "cache-control": "no-store" } });
});

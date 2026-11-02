import { handle, ok, requireUser } from "@/lib/http";
import { getDeck } from "@/lib/queries";

export const GET = handle(async () => {
  const user = await requireUser();
  return ok(await getDeck(user.id, 30));
});

import { handle, int, ok, requireUser } from "@/lib/http";
import { getDeck } from "@/lib/queries";

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  return ok(await getDeck(user.id, int(new URL(req.url).searchParams.get("limit"), 1, 100, 30)));
});

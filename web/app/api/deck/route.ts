import { handle, int, ok, requireUser } from "@/lib/http";
import { getDeck } from "@/lib/queries";

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams, k = p.get("kind");
  return ok(await getDeck(user.id, int(p.get("limit"), 1, 100, 30), k === "person" || k === "campaign" ? k : null));
});

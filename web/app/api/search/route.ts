import { handle, ok } from "@/lib/http";
import { searchPlaces } from "@/lib/queries";

export const GET = handle(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 60);
  if (q.length < 2 && !/^\d+$/.test(q)) return ok([]);
  return ok(await searchPlaces(q, 10));
});

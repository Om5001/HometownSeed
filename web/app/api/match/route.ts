import { cleanZips, handle, int, ok, readJson } from "@/lib/http";
import { findMatches } from "@/lib/queries";

/** Matches for a draft campaign (before it is published). */
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const zips = cleanZips(body.zips);
  if (!zips.length) return ok([]);
  const goal = int(body.goalCents, 0, 1e12, 0);
  const minAge = int(body.minAge, 0, 17, 0), maxAge = int(body.maxAge, minAge, 17, 17);
  return ok(await findMatches(zips, goal, minAge, maxAge, undefined, 6));
});

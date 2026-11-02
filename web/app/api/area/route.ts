import { cleanZips, handle, int, ok } from "@/lib/http";
import { areaStats, getRules, suggestNearby, zipDetails } from "@/lib/queries";

/** Live numbers for the campaign builder: kids, 5,000 test, nearby ZIPs to add. */
export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const zips = cleanZips(body.zips);
  const minAge = int(body.minAge, 0, 17, 0), maxAge = int(body.maxAge, minAge, 17, 17);
  const [rules, area, details, nearby] = await Promise.all([
    getRules(),
    zips.length ? areaStats(zips, minAge, maxAge) : null,
    zipDetails(zips, minAge, maxAge),
    zips.length ? suggestNearby(zips, 8) : [],
  ]);
  return ok({ rules, area, zips: details, nearby });
});

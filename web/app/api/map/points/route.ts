import { db } from "@/lib/db";
import { handle } from "@/lib/http";

/** Every ZIP area as compact text: "zcta,lat,lon,kids;..." (cached; changes only when Census data reloads). */
export const GET = handle(async () => {
  const rows = await db()<{ z: string; lat: number; lon: number; k: number }[]>`
    select zcta::text as z, round(lat::numeric, 3)::float8 as lat, round(lon::numeric, 3)::float8 as lon, kids_u18::int as k
    from zcta_stats where lat is not null`;
  const body = rows.map((r) => `${r.z},${r.lat},${r.lon},${r.k}`).join(";");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
});

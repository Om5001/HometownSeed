import { db } from "@/lib/db";
import { handle, ok } from "@/lib/http";

/** ZIPs inside active campaigns. state 2 = the campaign (or its pool) reaches 5,000 kids; 1 = still building. */
export const GET = handle(async () => {
  const rows = await db()<{ z: string; s: number; n: number; raised: number }[]>`
    select cz.zcta::text as z,
           max(case when s.meets_min or coalesce(p.meets_min, false) then 2 else 1 end)::int as s,
           count(*)::int as n,
           sum(s.raised_cents)::float8 as raised
    from campaign_zips cz
    join v_campaign_stats s on s.id = cz.campaign_id and s.status = 'active'
    left join v_pool_stats p on p.id = s.pool_id
    group by cz.zcta`;
  return ok(rows, { headers: { "cache-control": "public, max-age=30, s-maxage=30" } });
});

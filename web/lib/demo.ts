/**
 * TEMPORARY demo helpers. Delete this file, components/demo/, and their two imports
 * (app/page.tsx, app/zip/[zip]/page.tsx) when the demo data is removed.
 */
import { db } from "./db";

export type NotablePledge = {
  id: string; donor: string; amount: string; per_child: string | null; form: string; scope: string; state: string | null;
  min_age: number | null; max_age: number | null; income_max: number | null; who: string; announced: string | null; source_name: string; source_url: string;
};

export async function notablePledges(): Promise<NotablePledge[]> {
  try {
    return await db()<NotablePledge[]>`select * from demo_notable_pledges order by sort`;
  } catch { return []; }   // table not loaded (DEMO_DATA=0) or removed
}

/** Which reported pledges could reach kids in a ZIP, by its state and median income. */
export function pledgesForZip(all: NotablePledge[], state: string | null, income: number | null) {
  return all.filter((p) => (p.scope === "national" || (p.scope === "state" && p.state === state)))
    .map((p) => ({ ...p, incomeOk: p.income_max === null ? null : income === null ? null : income < p.income_max }));
}

export type PledgeMapInfo = {
  id: string; donor: string; per_child_cents: number; min_age: number; max_age: number; income_max: number | null;
  scope: string; state: string | null; map_note: string | null; total_cents: number; kids: number; zips: number;
};

/**
 * Where announced pledges are going, by ZIP: estimated dollars = eligible kids (by age, citizen
 * share, state, ZIP median income) x the pledge's dollars per child. Encoded compactly for the map:
 * rows "zcta,i:cents,i:cents;..." where i indexes `pledges`.
 */
export async function pledgeMap(): Promise<{ pledges: PledgeMapInfo[]; rows: string; unmapped: { donor: string; note: string | null }[] }> {
  const sql = db();
  try {
    const [rows, info, unmapped] = await Promise.all([
      sql<{ z: string; id: string; cents: number }[]>`
        select z.zcta::text as z, p.id,
               round(child_estimate(a, p.min_age, p.max_age) * citizen_share(a) * p.per_child_cents)::float8 as cents
        from demo_notable_pledges p
        join zcta_stats z on (p.scope = 'national' or (p.scope = 'state' and z.place_state = p.state))
                         and (p.income_max is null or z.median_hh_income < p.income_max)
        join acs_zcta_children a on a.zcta = z.zcta and a.acs_year = z.acs_year
        where p.map_layer and p.per_child_cents is not null`,
      sql<Omit<PledgeMapInfo, "total_cents" | "kids" | "zips">[]>`
        select id, donor, per_child_cents, min_age, max_age, income_max, scope, state, map_note
        from demo_notable_pledges where map_layer and per_child_cents is not null order by sort`,
      sql<{ donor: string; note: string | null }[]>`
        select donor, map_note as note from demo_notable_pledges where not map_layer and scope in ('national', 'state') order by sort`,
    ]);
    const idx = new Map(info.map((p, i) => [p.id, i]));
    const pledges: PledgeMapInfo[] = info.map((p) => ({ ...p, total_cents: 0, kids: 0, zips: 0 }));
    const byZip = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.cents) continue;
      const i = idx.get(r.id)!;
      pledges[i].total_cents += r.cents; pledges[i].kids += r.cents / pledges[i].per_child_cents; pledges[i].zips++;
      const a = byZip.get(r.z) ?? []; a.push(`${i}:${Math.round(r.cents)}`); byZip.set(r.z, a);
    }
    for (const p of pledges) p.kids = Math.round(p.kids);
    return { pledges, rows: [...byZip].map(([z, a]) => `${z},${a.join(",")}`).join(";"), unmapped };
  } catch { return { pledges: [], rows: "", unmapped: [] }; }   // demo table not loaded
}

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

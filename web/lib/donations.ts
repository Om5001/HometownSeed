/**
 * Gifts to the Hometown Seed Fund: donations to Hometown Seed Foundation itself (the 501(c)(3))
 * rather than to one campaign. The Fund adds to coalitions in the places donors choose when those
 * coalitions go to Treasury. Pledges only until payments are connected (see lib/payments.ts).
 */
import { db } from "./db";
import { HttpError } from "./http";
import type { User } from "./auth";

export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export type DonationInput = { amountCents?: unknown; frequency?: unknown; designation?: unknown; state?: unknown; zip?: unknown; anonymous?: unknown; message?: unknown; name?: unknown };

export async function createDonation(user: User, b: DonationInput) {
  const amount = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amount) || amount < 500) throw new HttpError(400, "The minimum gift is $5.");
  if (amount > 100_000_000_00) throw new HttpError(400, "For gifts over $100 million, please contact us.");
  const frequency = b.frequency === "monthly" ? "monthly" : "once";
  const designation = b.designation === "state" ? "state" : b.designation === "zip" ? "zip" : "anywhere";
  let state: string | null = null, zcta: string | null = null;
  const sql = db();
  if (designation === "state") {
    state = String(b.state ?? "").toUpperCase();
    if (!STATES[state]) throw new HttpError(400, "Choose a state.");
  }
  if (designation === "zip") {
    zcta = String(b.zip ?? "").trim();
    if (!/^\d{5}$/.test(zcta)) throw new HttpError(400, "Choose a ZIP code.");
    const [z] = await sql`select 1 from zcta_stats where zcta = ${zcta}`;
    if (!z) throw new HttpError(400, "We don't have Census data for that ZIP code. Try a nearby one.");
  }
  const name = String(b.name ?? user.display_name).trim().slice(0, 80) || user.display_name;
  const message = String(b.message ?? "").trim().slice(0, 280) || null;
  const [d] = await sql<{ id: string }[]>`
    insert into fund_donations (user_id, donor_name, is_anonymous, amount_cents, frequency, designation, state, zcta, message)
    values (${user.id}, ${name}, ${b.anonymous === true}, ${amount}, ${frequency}, ${designation}, ${state}, ${zcta}, ${message})
    returning id`;
  return { id: d.id, amount_cents: amount, frequency, designation, state, zcta };
}

export type FundSummary = {
  total_cents: number; monthly_cents: number; donors: number; gifts: number;
  places: { label: string; kind: "anywhere" | "state" | "zip"; cents: number; href: string | null }[];
  recent: { name: string; cents: number; frequency: string; where: string; message: string | null; created_at: string }[];
};

const whereLabel = (designation: string, state: string | null, zcta: string | null, place: string | null) =>
  designation === "state" ? STATES[state ?? ""] ?? state ?? "" : designation === "zip" ? `${zcta}${place ? " · " + place : ""}` : "Wherever it's needed most";

export async function fundSummary(): Promise<FundSummary> {
  const sql = db();
  const live = sql`status in ('pledged', 'pending', 'succeeded')`;
  const [[t], places, recent] = await Promise.all([
    sql<{ total: number; monthly: number; donors: number; gifts: number }[]>`
      select coalesce(sum(amount_cents) filter (where frequency = 'once'), 0)::float8 as total,
             coalesce(sum(amount_cents) filter (where frequency = 'monthly'), 0)::float8 as monthly,
             count(distinct coalesce(user_id::text, id::text))::int as donors, count(*)::int as gifts
      from fund_donations where ${live}`,
    sql<{ designation: string; state: string | null; zcta: string | null; place: string | null; cents: number }[]>`
      select f.designation, f.state, f.zcta, z.place_name || ', ' || z.place_state as place, sum(f.amount_cents)::float8 as cents
      from fund_donations f left join zcta_stats z on z.zcta = f.zcta
      where ${live} group by 1, 2, 3, 4 order by cents desc limit 8`,
    sql<{ name: string; cents: number; frequency: string; designation: string; state: string | null; zcta: string | null; place: string | null; message: string | null; created_at: string }[]>`
      select case when f.is_anonymous then 'Anonymous' else f.donor_name end as name, f.amount_cents::float8 as cents, f.frequency,
             f.designation, f.state, f.zcta, z.place_name || ', ' || z.place_state as place, f.message, f.created_at::text
      from fund_donations f left join zcta_stats z on z.zcta = f.zcta
      where ${live} order by f.created_at desc limit 8`,
  ]);
  return {
    total_cents: t.total, monthly_cents: t.monthly, donors: t.donors, gifts: t.gifts,
    places: places.map((p) => ({ label: whereLabel(p.designation, p.state, p.zcta, p.place), kind: p.designation as "anywhere", cents: p.cents,
      href: p.designation === "zip" ? `/zip/${p.zcta}` : null })),
    recent: recent.map((r) => ({ name: r.name, cents: r.cents, frequency: r.frequency, where: whereLabel(r.designation, r.state, r.zcta, r.place), message: r.message, created_at: r.created_at })),
  };
}

export async function myDonations(userId: string) {
  const rows = await db()<{ id: string; cents: number; frequency: string; designation: string; state: string | null; zcta: string | null; place: string | null; created_at: string }[]>`
    select f.id, f.amount_cents::float8 as cents, f.frequency, f.designation, f.state, f.zcta, z.place_name || ', ' || z.place_state as place, f.created_at::text
    from fund_donations f left join zcta_stats z on z.zcta = f.zcta
    where f.user_id = ${userId} and f.status in ('pledged', 'pending', 'succeeded') order by f.created_at desc`;
  return rows.map((r) => ({ ...r, where: whereLabel(r.designation, r.state, r.zcta, r.place) }));
}

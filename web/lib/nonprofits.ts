/**
 * Nonprofits people represent, and looking organizations up.
 *
 * Sources, in order:
 * 1. IRS Exempt Organizations Business Master File, if loaded into `irs_exempt_orgs`
 *    (`zipgive irs-orgs --states NY,CT`). Official, monthly, no network call.
 * 2. ProPublica Nonprofit Explorer API (free, no key): built on the same IRS data plus
 *    990 filings. https://projects.propublica.org/nonprofits/api
 * The IRS has no public API for its Tax Exempt Organization Search; its data comes as the
 * bulk files used in (1).
 */
import { db } from "./db";
import { HttpError } from "./http";
import type { User } from "./auth";
import { PLATFORM } from "./platform";

const PP = "https://projects.propublica.org/nonprofits/api/v2";

export type OrgInfo = {
  ein: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null;
  subsection: string | null; is501c3: boolean; deductible: boolean | null; ntee_code: string | null; ruling: string | null;
  revenue_cents: number | null; source: "irs" | "propublica"; source_url: string;
};
export type Nonprofit = {
  id: string; ein: string; name: string; city: string | null; state: string | null; address: string | null; zip: string | null;
  verified_source: "irs" | "propublica" | "self"; is501c3: boolean; deductible: boolean | null; source_url: string | null;
};

export const normalizeEin = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const fmtEin = (e: string) => (e.length === 9 ? e.slice(0, 2) + "-" + e.slice(2) : e);
const ppUrl = (ein: string) => `https://projects.propublica.org/nonprofits/organizations/${ein}`;
const num = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const sub2 = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v).padStart(2, "0"));

async function ppFetch(path: string): Promise<unknown | null> {
  try {
    const r = await fetch(PP + path, { headers: { accept: "application/json", "user-agent": "HometownSeed/1.0" }, signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    console.warn("[nonprofits] ProPublica lookup failed:", (e as Error).message);
    throw new HttpError(502, "Couldn't reach ProPublica's nonprofit database. Try again, or enter the details by hand.");
  }
}

/** Look up one organization by EIN. Returns null when neither source knows it. */
export async function lookupEin(einIn: string): Promise<OrgInfo | null> {
  const ein = normalizeEin(einIn);
  if (ein.length !== 9) throw new HttpError(400, "An EIN has 9 digits, like 12-3456789.");
  const [irs] = await db()<{ name: string; street: string | null; city: string | null; state: string | null; zip: string | null; subsection: string | null;
    deductibility: string | null; ntee_cd: string | null; ruling: string | null; revenue_amt: number | null }[]>`
    select name, street, city, state, zip, subsection, deductibility, ntee_cd, ruling, revenue_amt::float8 as revenue_amt
    from irs_exempt_orgs where ein = ${ein}`;
  if (irs) return {
    ein, name: irs.name, address: irs.street, city: irs.city, state: irs.state, zip: irs.zip, subsection: irs.subsection,
    is501c3: irs.subsection === "03", deductible: irs.deductibility === "1", ntee_code: irs.ntee_cd, ruling: irs.ruling,
    revenue_cents: irs.revenue_amt === null ? null : irs.revenue_amt * 100, source: "irs", source_url: ppUrl(ein),
  };
  const d = (await ppFetch(`/organizations/${ein}.json`)) as { organization?: Record<string, unknown> } | null;
  const o = d?.organization;
  if (!o) return null;
  const sub = sub2(o.subsection_code ?? o.subseccd);
  return {
    ein, name: String(o.name ?? ""), address: (o.address as string) ?? null, city: (o.city as string) ?? null, state: (o.state as string) ?? null,
    zip: (o.zipcode as string) ?? null, subsection: sub, is501c3: sub === "03",
    deductible: o.deductibility_code === undefined || o.deductibility_code === null ? null : Number(o.deductibility_code) === 1,
    ntee_code: (o.ntee_code as string) ?? null, ruling: o.ruling_date ? String(o.ruling_date) : null,
    revenue_cents: num(o.revenue_amount ?? o.income_amount) === null ? null : num(o.revenue_amount ?? o.income_amount)! * 100,
    source: "propublica", source_url: ppUrl(ein),
  };
}

export type SearchHit = { ein: string; name: string; city: string | null; state: string | null; ntee_code: string | null; source: "irs" | "propublica"; url: string };

/** Find 501(c)(3)s by name and/or state. */
export async function searchOrgs(q: string, state: string): Promise<{ hits: SearchHit[]; source: "irs" | "propublica" }> {
  q = q.trim().slice(0, 80); state = state.trim().toUpperCase().slice(0, 2);
  const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  if (state && !STATES.includes(state)) throw new HttpError(400, "Use a two-letter state code, like NY.");
  if (q.length < 2 && !state) throw new HttpError(400, "Enter a name or choose a state.");
  const sql = db();
  const [{ loaded }] = await sql<{ loaded: boolean }[]>`
    select exists (select 1 from irs_exempt_orgs ${state ? sql`where state = ${state}` : sql``}) as loaded`;
  if (loaded) {
    const rows = await sql<{ ein: string; name: string; city: string | null; state: string | null; ntee_cd: string | null }[]>`
      select ein, name, city, state, ntee_cd from irs_exempt_orgs
      where subsection = '03' ${state ? sql`and state = ${state}` : sql``}
        ${q ? sql`and (name ilike ${"%" + q + "%"} or ein = ${normalizeEin(q)})` : sql``}
      order by revenue_amt desc nulls last limit 25`;
    return { source: "irs", hits: rows.map((r) => ({ ein: r.ein, name: r.name, city: r.city, state: r.state, ntee_code: r.ntee_cd, source: "irs", url: ppUrl(r.ein) })) };
  }
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (state) p.set("state[id]", state);
  p.set("c_code[id]", "3");
  const d = (await ppFetch(`/search.json?${p}`)) as { organizations?: Record<string, unknown>[] } | null;
  return {
    source: "propublica",
    hits: (d?.organizations ?? []).slice(0, 25).map((o) => {
      const ein = String(o.ein ?? "").padStart(9, "0");
      return { ein, name: String(o.name ?? ""), city: (o.city as string) ?? null, state: (o.state as string) ?? null, ntee_code: (o.ntee_code as string) ?? null, source: "propublica", url: ppUrl(ein) };
    }),
  };
}

const npCols = (sql: ReturnType<typeof db>) => sql`
  n.id, n.ein::text as ein, n.name, n.city, n.state, n.address, n.zip, n.verified_source,
  coalesce(n.subsection = '03', false) as "is501c3", n.deductible, n.source_url`;

export async function myNonprofits(userId: string) {
  const sql = db();
  return sql<(Nonprofit & { title: string | null; phone: string | null })[]>`
    select ${npCols(sql)}, r.title, r.phone from nonprofit_reps r join nonprofits n on n.id = r.nonprofit_id
    where r.user_id = ${userId} order by r.created_at`;
}

/** Nonprofits on Hometown Seed (public details only), for people looking for one. */
export async function listPlatformNonprofits(state?: string) {
  const sql = db();
  return sql<(Nonprofit & { reps: string[]; rep_ids: string[] })[]>`
    select ${npCols(sql)}, array_agg(u.display_name order by r.created_at) as reps, array_agg(u.id::text order by r.created_at) as rep_ids
    from nonprofits n join nonprofit_reps r on r.nonprofit_id = n.id join app_users u on u.id = r.user_id
    ${state ? sql`where n.state = ${state.toUpperCase()}` : sql``}
    group by n.id order by (n.verified_source <> 'self') desc, n.name limit 200`;
}

export type RegisterInput = { ein?: unknown; title?: unknown; phone?: unknown; name?: unknown; address?: unknown; city?: unknown; state?: unknown; zip?: unknown };

/** "I represent this nonprofit": verified from the IRS file or ProPublica when we can find it. */
export async function registerNonprofit(user: User, b: RegisterInput) {
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const ein = normalizeEin(b.ein);
  if (ein.length !== 9) throw new HttpError(400, "Enter the organization's 9-digit EIN.");
  const title = s(b.title, 100), phone = s(b.phone, 40);
  if (!title) throw new HttpError(400, "Enter your title at the organization (for example, Executive Director).");
  const found = await lookupEin(ein).catch((e) => { if (e instanceof HttpError && e.status === 502) return null; throw e; });
  const sql = db();
  const manual = { name: s(b.name, 200), address: s(b.address, 200), city: s(b.city, 80), state: s(b.state, 2).toUpperCase(), zip: s(b.zip, 10) };
  if (!found && manual.name.length < 2) throw new HttpError(404, "We couldn't find that EIN in IRS or ProPublica records. Check it, or enter the organization's details by hand.");
  if (found && !found.is501c3) throw new HttpError(400, `${found.name} is listed as a 501(c)(${Number(found.subsection) || "?"}) organization, not a 501(c)(3). Only 501(c)(3) charities (or governments) can be Qualified Donors.`);
  const o = found
    ? { name: found.name, address: found.address, city: found.city, state: found.state, zip: found.zip, subsection: found.subsection, deductible: found.deductible,
        ntee_code: found.ntee_code, ruling: found.ruling, revenue_cents: found.revenue_cents, verified_source: found.source, source_url: found.source_url }
    : { ...manual, subsection: null, deductible: null, ntee_code: null, ruling: null, revenue_cents: null, verified_source: "self" as const, source_url: null };
  return sql.begin(async (tx) => {
    const [n] = await tx<{ id: string }[]>`
      insert into nonprofits (ein, name, address, city, state, zip, subsection, deductible, ntee_code, ruling, revenue_cents,
                              verified_source, verified_at, source_url, created_by)
      values (${ein}, ${o.name}, ${o.address || null}, ${o.city || null}, ${o.state || null}, ${o.zip || null}, ${o.subsection}, ${o.deductible},
              ${o.ntee_code}, ${o.ruling}, ${o.revenue_cents}, ${o.verified_source}, ${found ? sql`now()` : null}, ${o.source_url}, ${user.id})
      on conflict (ein) do update set
        -- official data always wins over hand-entered data
        name = case when excluded.verified_source <> 'self' or nonprofits.verified_source = 'self' then excluded.name else nonprofits.name end,
        address = coalesce(excluded.address, nonprofits.address), city = coalesce(excluded.city, nonprofits.city),
        state = coalesce(excluded.state, nonprofits.state), zip = coalesce(excluded.zip, nonprofits.zip),
        subsection = coalesce(excluded.subsection, nonprofits.subsection), deductible = coalesce(excluded.deductible, nonprofits.deductible),
        verified_source = case when excluded.verified_source <> 'self' then excluded.verified_source else nonprofits.verified_source end,
        verified_at = coalesce(excluded.verified_at, nonprofits.verified_at), source_url = coalesce(excluded.source_url, nonprofits.source_url),
        updated_at = now()
      returning id`;
    await tx`insert into nonprofit_reps (nonprofit_id, user_id, title, phone) values (${n.id}, ${user.id}, ${title}, ${phone || null})
             on conflict (nonprofit_id, user_id) do update set title = excluded.title, phone = excluded.phone`;
    await tx`update app_users set has_nonprofit = true where id = ${user.id}`;
    return { id: n.id, verified: o.verified_source, name: o.name };
  });
}

export async function removeNonprofit(user: User, nonprofitId: string) {
  const sql = db();
  const [used] = await sql`select 1 from pools where donor_nonprofit_id = ${nonprofitId} and donor_rep_user_id = ${user.id}
                           and status in ('approved', 'submitted', 'accepted', 'funded')`;
  if (used) throw new HttpError(400, "This nonprofit is the Qualified Donor on an application in progress, so you can't remove it now.");
  await sql`delete from nonprofit_reps where nonprofit_id = ${nonprofitId} and user_id = ${user.id}`;
  await sql`update pools set donor_nonprofit_id = null, donor_rep_user_id = null
            where donor_nonprofit_id = ${nonprofitId} and donor_rep_user_id = ${user.id} and status in ('forming', 'confirmed', 'rejected')`;
  return { ok: true };
}

/** Which people (by user id) represent a nonprofit, for check marks next to their names. */
export async function nonprofitBadges(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db()<{ user_id: string; name: string }[]>`
    select distinct on (r.user_id) r.user_id, n.name from nonprofit_reps r join nonprofits n on n.id = r.nonprofit_id
    where r.user_id = any(${userIds}::uuid[]) order by r.user_id, (n.verified_source <> 'self') desc`;
  return new Map(rows.map((r) => [r.user_id, r.name]));
}

// --- A coalition's Qualified Donor -----------------------------------------------------


export type Donor = {
  kind: "platform" | "member";
  nonprofit_id: string | null; rep_user_id: string | null; verified_source: string;
  entity_name: string; entity_address: string; ein: string; entity_type: "501c3";
  rep_name: string; rep_title: string; rep_address: string; rep_email: string; rep_phone: string;
};

/** The organization that applies to Treasury for a coalition: a member's nonprofit, or Hometown Seed's. */
export async function getDonor(sql: ReturnType<typeof db>, poolId: string): Promise<Donor> {
  const [d] = await sql<{ id: string; ein: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null;
    verified_source: string; rep_user_id: string; rep_name: string; rep_email: string; title: string | null; phone: string | null }[]>`
    select n.id, n.ein::text as ein, n.name, n.address, n.city, n.state, n.zip, n.verified_source,
           u.id as rep_user_id, u.display_name as rep_name, u.email as rep_email, r.title, r.phone
    from pools p join nonprofits n on n.id = p.donor_nonprofit_id
    join app_users u on u.id = p.donor_rep_user_id
    left join nonprofit_reps r on r.nonprofit_id = n.id and r.user_id = u.id
    where p.id = ${poolId}`;
  if (!d) return { kind: "platform", nonprofit_id: null, rep_user_id: null, verified_source: "platform", ...PLATFORM };
  const addr = [d.address, d.city, [d.state, d.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "[Mailing address]";
  return {
    kind: "member", nonprofit_id: d.id, rep_user_id: d.rep_user_id, verified_source: d.verified_source,
    entity_name: d.name, entity_address: addr, ein: fmtEin(d.ein), entity_type: "501c3",
    rep_name: d.rep_name, rep_title: d.title || "[Title]", rep_address: addr, rep_email: d.rep_email, rep_phone: d.phone || "[Phone]",
  };
}

/** Nonprofits represented by someone in the coalition, which could be its Qualified Donor. */
export async function donorOptions(sql: ReturnType<typeof db>, poolId: string) {
  return sql<(Nonprofit & { rep_user_id: string; rep_name: string })[]>`
    select ${npCols(sql)}, u.id as rep_user_id, u.display_name as rep_name
    from coalition_people(${poolId}) x join nonprofit_reps r on r.user_id = x.user_id
    join nonprofits n on n.id = r.nonprofit_id join app_users u on u.id = r.user_id
    where coalesce(n.subsection, '03') = '03'
    order by (n.verified_source <> 'self') desc, n.name`;
}

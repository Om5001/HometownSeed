/** Server-side data access. Money is selected as float8 cents for JSON safety. */
import { db } from "./db";

export type Rules = { min_beneficiaries: number; min_per_child_cents: number; income_threshold: number; max_age: number };
export type CampaignRow = {
  id: string; slug: string; name: string; description: string | null; mode: "solo" | "match" | "friends";
  status: string; goal: number; raised: number; donors: number; kids: number; kids_u18: number;
  zip_count: number; meets_min: boolean; all_low_income: boolean; min_age: number; max_age: number;
  pool_id: string | null; created_at: string; is_demo: boolean; goal_pc: number | null; raised_pc: number | null;
  owner_id: string; owner_name: string; invite_code: string; places: string[]; lat: number | null; lon: number | null;
};
export type ZipRow = {
  zcta: string; place_name: string | null; place_state: string | null; kids_u18: number; kids_in_class?: number;
  median_hh_income: number | null; lat: number | null; lon: number | null; added_by?: string;
};

let rulesCache: { at: number; v: Rules } | null = null;
export async function getRules(): Promise<Rules> {
  if (rulesCache && Date.now() - rulesCache.at < 60_000) return rulesCache.v;
  const rows = await db()<{ key: string; value: number }[]>`select key, value::float8 as value from program_rules`;
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Rules;
  rulesCache = { at: Date.now(), v };
  return v;
}

const campaignSelect = (sql: ReturnType<typeof db>) => sql`
  select s.id, s.slug, s.name, s.description, s.mode, s.status,
         s.goal_cents::float8 as goal, s.raised_cents::float8 as raised, s.donors::int as donors,
         s.kids_in_class::float8 as kids, s.kids_u18::float8 as kids_u18, s.zip_count, s.meets_min, s.all_low_income,
         s.min_age, s.max_age, s.pool_id, s.created_at, s.is_demo, s.owner_id, s.invite_code,
         s.goal_per_child_cents::float8 as goal_pc, s.raised_per_child_cents::float8 as raised_pc, s.lat, s.lon,
         u.display_name as owner_name,
         coalesce((select array_agg(p) from (
             select coalesce(z.place_name || ', ' || z.place_state, 'ZIP ' || z.zcta) as p, max(z.kids_u18) as k
             from zcta_stats z where z.zcta = any(s.zctas::char(5)[]) group by 1 order by k desc limit 4) t), '{}') as places
  from v_campaign_stats s join app_users u on u.id = s.owner_id`;

export async function listCampaigns(opts: { q?: string; zcta?: string; owner?: string; limit?: number } = {}) {
  const sql = db();
  const q = (opts.q || "").trim();
  return sql<CampaignRow[]>`
    ${campaignSelect(sql)}
    where s.status = 'active'
      ${opts.zcta ? sql`and ${opts.zcta} = any(s.zctas)` : sql``}
      ${opts.owner ? sql`and s.owner_id = ${opts.owner}` : sql``}
      ${q ? sql`and (s.name ilike ${"%" + q + "%"} or ${q} = any(s.zctas)
                     or exists (select 1 from zcta_stats z where z.zcta = any(s.zctas::char(5)[]) and z.place_name ilike ${q + "%"}))` : sql``}
    order by s.raised_cents desc, s.created_at desc
    limit ${opts.limit ?? 24}`;
}

export async function getCampaign(slug: string) {
  const sql = db();
  const [c] = await sql<CampaignRow[]>`${campaignSelect(sql)} where s.slug = ${slug}`;
  if (!c) return null;
  const [zips, pledges, team, pool, incoming, outgoing] = await Promise.all([
    sql<ZipRow[]>`
      select z.zcta::text as zcta, z.place_name, z.place_state, z.kids_u18::float8 as kids_u18,
             round(child_estimate(a, ${c.min_age}, ${c.max_age}) * citizen_share(a))::float8 as kids_in_class,
             z.median_hh_income, z.lat, z.lon, cz.added_by
      from campaign_zips cz
      join zcta_stats z on z.zcta = cz.zcta
      join acs_zcta_children a on a.zcta = z.zcta and a.acs_year = z.acs_year
      where cz.campaign_id = ${c.id}
      order by z.kids_u18 desc`,
    sql<{ id: string; name: string; amount: number; message: string | null; created_at: string }[]>`
      select id, case when is_anonymous then 'Anonymous' else donor_name end as name,
             amount_cents::float8 as amount, message, created_at
      from pledges where campaign_id = ${c.id} and status in ('pledged', 'pending', 'succeeded')
      order by created_at desc limit 25`,
    sql<{ id: string; display_name: string; role: string }[]>`
      select u.id, u.display_name, m.role from campaign_members m join app_users u on u.id = m.user_id
      where m.campaign_id = ${c.id} order by m.role = 'owner' desc, m.joined_at`,
    c.pool_id
      ? sql`select p.id, p.name, p.zip_count, p.kids_in_class::float8 as kids, p.kids_u18::float8 as kids_u18, p.meets_min,
                   p.raised_cents::float8 as raised, p.goal_cents::float8 as goal, p.raised_per_child_cents::float8 as raised_pc,
                   (select json_agg(json_build_object('slug', x.slug, 'name', x.name) order by x.created_at)
                      from campaigns x where x.pool_id = p.id) as campaigns
            from v_pool_stats p where p.id = ${c.pool_id}`
      : Promise.resolve([]),
    sql<{ id: string; slug: string; name: string; message: string | null; created_at: string }[]>`
      select r.id, f.slug, f.name, r.message, r.created_at from pool_requests r join campaigns f on f.id = r.from_campaign
      where r.to_campaign = ${c.id} and r.status = 'pending' order by r.created_at desc`,
    sql<{ id: string; to_campaign: string }[]>`
      select r.id, r.to_campaign from pool_requests r where r.from_campaign = ${c.id} and r.status = 'pending'`,
  ]);
  return { campaign: c, zips, pledges, team, pool: (pool as unknown as Record<string, unknown>[])[0] ?? null, incoming, outgoing };
}

export type Match = {
  campaign_id: string; slug: string; name: string; match_type: "same_area" | "nearby" | "similar_goal";
  score: number; shared_zips: number; overlap_share: number; miles: number | null;
  my_goal_per_child: number | null; their_goal_per_child: number | null; goal_similarity: number;
  combined_kids_u18: number; reaches_min_together: boolean; same_age_class: boolean; reasons: string[];
  raised?: number; goal?: number; kids?: number;
};

export async function findMatches(zips: string[], goalCents: number, minAge: number, maxAge: number, exclude?: string, limit = 6) {
  const sql = db();
  return sql<Match[]>`
    select m.campaign_id, m.slug, m.name, m.match_type, m.score::float8 as score, m.shared_zips,
           m.overlap_share::float8 as overlap_share, m.miles::float8 as miles,
           m.my_goal_per_child::float8 as my_goal_per_child, m.their_goal_per_child::float8 as their_goal_per_child,
           m.goal_similarity::float8 as goal_similarity, m.combined_kids_u18::float8 as combined_kids_u18,
           m.reaches_min_together, m.same_age_class, m.reasons,
           s.raised_cents::float8 as raised, s.goal_cents::float8 as goal, s.kids_in_class::float8 as kids
    from match_campaigns(${zips}, ${goalCents}, ${minAge}, ${maxAge}, ${exclude ?? null}, ${limit}) m
    join v_campaign_stats s on s.id = m.campaign_id`;
}

export async function areaStats(zips: string[], minAge = 0, maxAge = 17) {
  const [a] = await db()<{
    zctas: string[]; missing: string[]; zip_count: number; kids_in_class: number; kids_u18: number;
    meets_min: boolean; all_low_income: boolean; lat: number | null; lon: number | null;
  }[]>`
    select zctas, missing, zip_count, kids_in_class::float8 as kids_in_class, kids_u18::float8 as kids_u18,
           meets_min, all_low_income, lat, lon
    from area_stats(${zips}, ${minAge}, ${maxAge})`;
  return a;
}

export async function zipDetails(zips: string[], minAge = 0, maxAge = 17) {
  if (!zips.length) return [];
  return db()<ZipRow[]>`
    select z.zcta::text as zcta, z.place_name, z.place_state, z.kids_u18::float8 as kids_u18,
           round(child_estimate(a, ${minAge}, ${maxAge}) * citizen_share(a))::float8 as kids_in_class,
           z.median_hh_income, z.lat, z.lon
    from zcta_stats z join acs_zcta_children a on a.zcta = z.zcta and a.acs_year = z.acs_year
    where z.zcta = any(${zips}::char(5)[])
    order by z.kids_u18 desc`;
}

export async function suggestNearby(zips: string[], limit = 8) {
  if (!zips.length) return [];
  // nearest ZIPs to the area's centroid that aren't already included
  return db()<ZipRow[]>`
    with a as (select lat, lon from area_stats(${zips}))
    select z.zcta::text as zcta, z.place_name, z.place_state, z.kids_u18::float8 as kids_u18,
           z.median_hh_income, z.lat, z.lon,
           round(miles_between(a.lat, a.lon, z.lat, z.lon)::numeric, 1)::float8 as miles
    from zcta_stats z, a
    where z.lat between a.lat - 0.6 and a.lat + 0.6
      and z.lon between a.lon - 0.8 and a.lon + 0.8
      and not (z.zcta = any(${zips}::char(5)[]))
      and z.kids_u18 > 0
    order by miles_between(a.lat, a.lon, z.lat, z.lon)
    limit ${limit}`;
}

export async function searchPlaces(q: string, limit = 10) {
  return db()<ZipRow[]>`
    select zcta, place_name, place_state, kids_u18::float8 as kids_u18, lat, lon from search_places(${q}, ${limit})`;
}

export type ZipProfile = ZipRow & {
  total_u18: number; total_u18_moe: number; land_sqmi: number | null; acs_year: number;
  age_0_2: number; age_3_4: number; age_5: number; age_6_8: number; age_9_11: number; age_12_14: number; age_15_17: number;
  group_quarters_u18: number; citizen_u18: number; noncitizen_u18: number;
};
export async function getZip(zcta: string) {
  const sql = db();
  const [z] = await sql<ZipProfile[]>`
    select z.zcta::text as zcta, z.place_name, z.place_state, z.kids_u18::float8 as kids_u18, z.total_u18, z.total_u18_moe,
           z.median_hh_income, z.lat, z.lon, z.land_sqmi, z.acs_year,
           a.age_0_2, a.age_3_4, a.age_5, a.age_6_8, a.age_9_11, a.age_12_14, a.age_15_17, a.group_quarters_u18,
           a.citizen_u18, a.noncitizen_u18
    from zcta_stats z join acs_zcta_children a on a.zcta = z.zcta and a.acs_year = z.acs_year
    where z.zcta = ${zcta}`;
  return z ?? null;
}

export async function homeStats() {
  const [s] = await db()`
    select count(*)::int as campaigns, coalesce(sum(raised_cents), 0)::float8 as raised,
           (select count(distinct cz.zcta)::int from campaign_zips cz join campaigns c on c.id = cz.campaign_id where c.status = 'active') as zips,
           (select coalesce(sum(z.kids_u18), 0)::float8 from zcta_stats z where z.zcta in
               (select cz.zcta from campaign_zips cz join campaigns c on c.id = cz.campaign_id where c.status = 'active')) as kids,
           (select count(*)::int from zcta_stats) as all_zips,
           (select coalesce(sum(kids_u18), 0)::float8 from zcta_stats) as all_kids,
           (select max(acs_year) from zcta_stats) as acs_year
    from v_campaign_stats where status = 'active'`;
  return s as { campaigns: number; raised: number; zips: number; kids: number; all_zips: number; all_kids: number; acs_year: number };
}

export async function audit(actor: string | null, action: string, entity: string, entityId: string, detail: object = {}) {
  await db()`insert into audit_log (actor_id, action, entity, entity_id, detail) values (${actor}, ${action}, ${entity}, ${entityId}, ${db().json(detail as never)})`;
}

export async function memberRole(campaignId: string, userId: string | undefined | null) {
  if (!userId) return null;
  const [m] = await db()<{ role: string }[]>`select role from campaign_members where campaign_id = ${campaignId} and user_id = ${userId}`;
  return m?.role ?? null;
}

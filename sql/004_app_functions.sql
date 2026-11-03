-- ============================================================================
-- App query layer: area math, campaign/pool stats, matching, search.
-- ============================================================================

-- Latest ACS year per ZCTA joined with location and per-ZIP eligible kids.
-- Materialized for speed; the pipeline refreshes it after each data load.
-- Rebuilt on every migrate so definition changes take effect (takes a second).
drop materialized view if exists zcta_stats;
create materialized view zcta_stats as
select a.zcta,
       a.acs_year,
       round(child_estimate(a, 0, 17) * citizen_share(a))  as kids_u18,      -- est. account beneficiaries
       a.total_u18,
       a.total_u18_moe,
       a.median_hh_income,
       g.lat, g.lon, g.land_sqmi,
       coalesce(initcap(x.po_name), g.place_name)  as place_name,   -- USPS city (e.g. Brooklyn) when a crosswalk is loaded
       coalesce(x.state, g.place_state)            as place_state
from acs_zcta_children a
left join zcta_geo g on g.zcta = a.zcta
left join zip_to_zcta x on x.zip = a.zcta and x.zcta = a.zcta
where a.acs_year = (select max(acs_year) from acs_zcta_children);
create unique index if not exists zcta_stats_zcta_idx on zcta_stats (zcta);

-- Everything about a set of ZIPs for one age class.
create or replace function area_stats(p_zips text[], p_min_age int default 0, p_max_age int default 17)
returns table (
    zctas            text[],
    missing          text[],
    zip_count        int,
    kids_in_class    numeric,   -- citizen-adjusted kids in the age range (who would receive money)
    kids_u18         numeric,   -- all estimated beneficiaries (used for the 5,000 test)
    meets_min        boolean,
    all_low_income   boolean,   -- every ZIP below the income threshold (can combine without touching)
    lat              double precision,   -- kid-weighted centroid
    lon              double precision
)
-- rows 1: it always returns one row. Without this hint the planner assumes 1,000 rows,
-- overestimates every query that uses it, and turns on JIT compilation (seconds per call).
language sql stable rows 1 as $$
    with input as (
        select distinct coalesce(x.zcta, lpad(trim(z), 5, '0')::char(5)) as zcta, lpad(trim(z), 5, '0') as asked
        from unnest(p_zips) z
        left join zip_to_zcta x on x.zip = lpad(trim(z), 5, '0')
        where trim(z) <> ''
    ),
    hit as (
        select distinct on (a.zcta) a.zcta::text as zcta,
               child_estimate(a, p_min_age, p_max_age) * citizen_share(a) as k_class,
               child_estimate(a, 0, 17) * citizen_share(a)               as k_u18,
               a.median_hh_income, g.lat, g.lon
        from input i
        join acs_zcta_children a on a.zcta = i.zcta
             and a.acs_year = (select max(acs_year) from acs_zcta_children)
        left join zcta_geo g on g.zcta = a.zcta
    )
    select
        coalesce((select array_agg(zcta order by zcta) from hit), '{}'),
        coalesce((select array_agg(asked order by asked) from input i
                  where not exists (select 1 from hit h where h.zcta = i.zcta)), '{}'),
        (select count(*)::int from hit),
        coalesce((select round(sum(k_class)) from hit), 0),
        coalesce((select round(sum(k_u18)) from hit), 0),
        coalesce((select sum(k_u18) from hit), 0) >= rule('min_beneficiaries'),
        coalesce((select bool_and(median_hh_income is not null and median_hh_income < rule('income_threshold')) from hit), false),
        (select sum(lat * k_u18) / nullif(sum(k_u18), 0) from hit where lat is not null),
        (select sum(lon * k_u18) / nullif(sum(k_u18), 0) from hit where lon is not null)
$$;

create or replace function miles_between(lat1 double precision, lon1 double precision,
                                         lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
    select 3958.8 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- Live stats for every campaign ------------------------------------------------
-- Views are rebuilt on every migrate so their columns can change.
drop view if exists v_pool_stats;
drop view if exists v_campaign_stats;
create view v_campaign_stats as
select c.id, c.slug, c.name, c.description, c.mode, c.status,
       -- effective goal: a per-child goal grows with the kid count; an open goal has none
       case c.goal_type when 'per_child' then round(c.goal_per_child_cents * s.kids_in_class)
                        when 'open' then null else c.goal_cents end                            as goal_cents,
       c.min_age, c.max_age, c.pool_id, c.owner_id, c.invite_code, c.is_demo, c.created_at,
       s.zctas, s.zip_count, s.kids_in_class, s.kids_u18, s.meets_min, s.all_low_income, s.lat, s.lon,
       coalesce(p.raised_cents, 0)  as raised_cents,
       coalesce(p.donors, 0)        as donors,
       case c.goal_type when 'per_child' then c.goal_per_child_cents::numeric
                        when 'open' then null
                        else case when s.kids_in_class > 0 then c.goal_cents / s.kids_in_class end end as goal_per_child_cents,
       case when s.kids_in_class > 0 then coalesce(p.raised_cents, 0) / s.kids_in_class end as raised_per_child_cents,
       c.goal_type, c.open_to_matching, c.invite_friends
from campaigns c
cross join lateral area_stats(
    (select array_agg(zcta::text) from campaign_zips z where z.campaign_id = c.id), c.min_age, c.max_age) s
left join lateral (
    select sum(amount_cents) as raised_cents, count(distinct coalesce(user_id::text, donor_email, id::text)) as donors
    from pledges pl
    where pl.campaign_id = c.id and pl.status in ('pledged', 'pending', 'succeeded')
) p on true;

-- Pools (coalitions): the union of their campaigns' ZIPs and money -------------
create view v_pool_stats as
select pl.id, pl.name, pl.min_age, pl.max_age, pl.created_at, pl.status,
       (select array_agg(c.id) from campaigns c where c.pool_id = pl.id) as campaign_ids,
       s.zctas, s.zip_count, s.kids_in_class, s.kids_u18, s.meets_min, s.all_low_income, s.lat, s.lon,
       coalesce(m.raised_cents, 0) as raised_cents,
       coalesce(m.goal_cents, 0)   as goal_cents,
       case when s.kids_in_class > 0 then coalesce(m.raised_cents, 0) / s.kids_in_class end as raised_per_child_cents
from pools pl
cross join lateral area_stats(
    (select array_agg(distinct z.zcta::text) from campaign_zips z join campaigns c on c.id = z.campaign_id
     where c.pool_id = pl.id), pl.min_age, pl.max_age) s
left join lateral (
    select sum(cs.raised_cents) as raised_cents, sum(cs.goal_cents) as goal_cents
    from v_campaign_stats cs where cs.pool_id = pl.id
) m on true;

-- Matching ---------------------------------------------------------------------
-- Ranks active campaigns a new or existing campaign could join or pool with.
-- Priorities (from the product brief):
--   1. similar dollars per child  (so pooled money splits evenly, and reaches the $/child minimum)
--   2. same ZIP codes             (pile on: more money into the same kids)
--   3. nearby, and together reaching 5,000 kids
create or replace function match_campaigns(
    p_zips        text[],
    p_goal_cents  bigint,
    p_min_age     int default 0,
    p_max_age     int default 17,
    p_exclude     uuid default null,
    p_limit       int default 8
)
returns table (
    campaign_id           uuid,
    slug                  text,
    name                  text,
    match_type            text,      -- 'same_area' | 'nearby' | 'similar_goal'
    score                 numeric,
    shared_zips           int,
    overlap_share         numeric,   -- share of the smaller campaign's kids that both cover
    miles                 numeric,
    my_goal_per_child     numeric,
    their_goal_per_child  numeric,
    goal_similarity       numeric,
    combined_kids_u18     numeric,
    reaches_min_together  boolean,
    same_age_class        boolean,
    reasons               text[]
)
language sql stable set jit = off as $$
    with me as (select * from area_stats(p_zips, p_min_age, p_max_age)),
    me_z as (select unnest(me.zctas)::char(5) as zcta from me),
    excluded_pool as (select pool_id from campaigns where id = p_exclude and pool_id is not null),
    cand as (
        select cs.* from v_campaign_stats cs
        where cs.status = 'active'
          and cs.id is distinct from p_exclude
          and (cs.pool_id is null or cs.pool_id not in (select pool_id from excluded_pool))
          and cs.kids_in_class > 0
    ),
    scored as (
        select c.*,
               ov.shared, coalesce(ov.shared_kids, 0) as shared_kids,
               un.kids as union_kids, un.low_income as union_low_income,
               miles_between(me.lat, me.lon, c.lat, c.lon) as dist,
               case when me.kids_in_class > 0 then p_goal_cents / me.kids_in_class end as my_pc,
               (c.min_age = p_min_age and c.max_age = p_max_age) as same_age,
               me.kids_u18 as my_kids, me.meets_min as my_meets
        from cand c cross join me
        left join lateral (
            select count(*)::int as shared, sum(v.kids_u18) as shared_kids
            from campaign_zips z join me_z m on m.zcta = z.zcta
            join zcta_stats v on v.zcta = z.zcta
            where z.campaign_id = c.id
        ) ov on true
        left join lateral (
            select sum(v.kids_u18) as kids,
                   bool_and(v.median_hh_income is not null and v.median_hh_income < rule('income_threshold')) as low_income
            from (select zcta from me_z union select z.zcta from campaign_zips z where z.campaign_id = c.id) u
            join zcta_stats v on v.zcta = u.zcta
        ) un on true
    ),
    calc as (
        select s.*,
               coalesce(s.shared_kids / nullif(least(s.my_kids, s.kids_u18), 0), 0) as ov_share,
               case when s.my_pc is null or s.goal_per_child_cents is null then 0
                    else 1 - abs(s.my_pc - s.goal_per_child_cents) / greatest(s.my_pc, s.goal_per_child_cents) end as sim,
               greatest(0, 1 - coalesce(s.dist, 9999) / 60.0) as prox,
               (s.union_kids >= rule('min_beneficiaries') and not (s.my_meets and s.meets_min)) as reach
        from scored s
    )
    select c.id, c.slug, c.name,
           case when c.shared > 0 then 'same_area' when coalesce(c.dist, 9999) <= 60 then 'nearby' else 'similar_goal' end,
           round(((0.40 * c.sim + 0.35 * c.ov_share + 0.15 * c.prox + 0.10 * (c.reach or c.union_kids >= rule('min_beneficiaries'))::int)
                  * case when c.same_age then 1 else 0.6 end)::numeric, 3),
           coalesce(c.shared, 0),
           round(c.ov_share::numeric, 3),
           round(c.dist::numeric, 1),
           round(c.my_pc), round(c.goal_per_child_cents),
           round(c.sim::numeric, 3),
           c.union_kids,
           c.reach,
           c.same_age,
           array_remove(array[
               case when c.shared > 0 then 'Covers ' || c.shared || ' of the same ZIP code' || case when c.shared > 1 then 's' else '' end end,
               case when c.sim >= 0.8 then 'Similar goal per child' end,
               case when c.shared = 0 and c.dist <= 60 then round(c.dist::numeric) || ' miles away' end,
               case when c.reach then 'Together you reach 5,000 kids' end,
               case when c.shared = 0 and c.dist > 60 and c.union_low_income then 'All ZIPs pass the income test, so they can combine without touching' end,
               case when not c.same_age then 'Different age group' end
           ], null)
    from calc c
    where c.shared > 0
       or c.dist <= 60
       or (c.sim >= 0.75 and c.union_low_income)      -- far away: only if the income test allows combining
    order by 5 desc, c.raised_cents desc
    limit p_limit
$$;

-- Search ZIPs by number or place name (for the campaign builder) --------------
create or replace function search_places(p_q text, p_limit int default 12)
returns table (zcta text, place_name text, place_state text, kids_u18 numeric, lat double precision, lon double precision)
language sql stable as $$
    select v.zcta::text, v.place_name, v.place_state, v.kids_u18, v.lat, v.lon
    from zcta_stats v
    where (p_q ~ '^\d{1,5}$' and v.zcta::text like p_q || '%')
       or (p_q !~ '^\d' and length(trim(p_q)) >= 2 and (
            v.place_name ilike trim(split_part(p_q, ',', 1)) || '%'
            and (split_part(p_q, ',', 2) = '' or v.place_state ilike trim(split_part(p_q, ',', 2)) || '%')))
    order by (v.zcta::text = p_q) desc, v.kids_u18 desc
    limit p_limit
$$;

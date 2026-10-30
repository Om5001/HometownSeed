-- ============================================================================
-- Query functions your app calls dynamically (via SQL or Supabase RPC / PostgREST)
-- ============================================================================

-- Years of overlap between an ACS age bucket [lo, hi] and a requested range.
create or replace function _age_overlap(lo int, hi int, min_age int, max_age int)
returns numeric language sql immutable as $$
    select greatest(0, least(hi, max_age) - greatest(lo, min_age) + 1)::numeric
$$;

-- Estimated children aged [p_min_age, p_max_age] in one ZCTA row.
-- ACS buckets are split assuming an even spread of ages within each bucket.
create or replace function child_estimate(r acs_zcta_children, p_min_age int, p_max_age int)
returns numeric language sql immutable as $$
    select
          coalesce(r.age_0_2,   0) * _age_overlap(0,  2,  p_min_age, p_max_age) / 3
        + coalesce(r.age_3_4,   0) * _age_overlap(3,  4,  p_min_age, p_max_age) / 2
        + coalesce(r.age_5,     0) * _age_overlap(5,  5,  p_min_age, p_max_age) / 1
        + coalesce(r.age_6_8,   0) * _age_overlap(6,  8,  p_min_age, p_max_age) / 3
        + coalesce(r.age_9_11,  0) * _age_overlap(9,  11, p_min_age, p_max_age) / 3
        + coalesce(r.age_12_14, 0) * _age_overlap(12, 14, p_min_age, p_max_age) / 3
        + coalesce(r.age_15_17, 0) * _age_overlap(15, 17, p_min_age, p_max_age) / 3
        + coalesce(r.group_quarters_u18, 0) * _age_overlap(0, 17, p_min_age, p_max_age) / 18
$$;

-- Share of under-18s who are U.S. citizens (Trump Accounts require an SSN-holding
-- U.S. citizen child). Falls back to 1.0 when citizenship data is missing.
create or replace function citizen_share(r acs_zcta_children)
returns numeric language sql immutable as $$
    select case
        when r.total_u18 is null or r.total_u18 = 0 or r.citizen_u18 is null then 1.0
        else least(1.0, r.citizen_u18::numeric / r.total_u18)
    end
$$;

-- Per-ZIP estimates. ZIPs are resolved to ZCTAs through zip_to_zcta when a
-- crosswalk is loaded; otherwise ZIP = ZCTA (true for most residential ZIPs).
create or replace function zip_child_estimates(
    p_zips     text[],
    p_min_age  int default 0,
    p_max_age  int default 17,
    p_year     int default null
)
returns table (
    zip                    text,
    zcta                   text,
    found                  boolean,
    acs_year               int,
    est_children           numeric,   -- all children in age range
    est_eligible_children  numeric,   -- citizen-adjusted, in age range
    est_eligible_u18       numeric,   -- citizen-adjusted, all under 18
    total_u18_moe          int,
    median_hh_income       int,
    lat                    double precision,
    lon                    double precision
)
language sql stable as $$
    with input as (
        select distinct lpad(trim(z), 5, '0') as zip
        from unnest(p_zips) as z
        where trim(z) <> ''
    ),
    yr as (
        select coalesce(p_year, (select max(acs_year) from acs_zcta_children)) as y
    ),
    resolved as (
        select i.zip, coalesce(x.zcta, i.zip)::text as zcta
        from input i
        left join zip_to_zcta x on x.zip = i.zip
    )
    select
        r.zip,
        r.zcta,
        a.zcta is not null,
        yr.y,
        case when a.zcta is null then null
             else round(child_estimate(a, p_min_age, p_max_age)) end,
        case when a.zcta is null then null
             else round(child_estimate(a, p_min_age, p_max_age) * citizen_share(a)) end,
        case when a.zcta is null then null
             else round(child_estimate(a, 0, 17) * citizen_share(a)) end,
        a.total_u18_moe,
        a.median_hh_income,
        g.lat,
        g.lon
    from resolved r
    cross join yr
    left join acs_zcta_children a on a.zcta = r.zcta and a.acs_year = yr.y
    left join zcta_geo g on g.zcta = r.zcta
    order by r.zip
$$;

-- Evaluate a proposed donation area (set of ZIPs) against the proposed
-- qualified-geographic-area tests:
--   * at least 5,000 account beneficiaries (all under-18s, not just the age range)
--   * income test: every ZCTA median household income below the threshold
--     (default 160000 = IRC 414(q) HCE amount; VERIFY the current-year figure)
-- Contiguity is NOT checked here (needs ZCTA shapefiles; see README).
create or replace function evaluate_area(
    p_zips               text[],
    p_min_age            int default 0,
    p_max_age            int default 17,
    p_income_threshold   int default 160000,
    p_min_beneficiaries  int default 5000,
    p_year               int default null
)
returns table (
    acs_year                     int,
    zips_requested               int,
    zctas_matched                int,
    missing_zips                 text[],
    est_children_in_age_range    numeric,
    est_eligible_in_age_range    numeric,
    est_eligible_u18             numeric,
    meets_min_beneficiaries      boolean,
    all_below_income_threshold   boolean,
    zctas_at_or_above_threshold  text[]
)
language sql stable as $$
    with e as (
        select * from zip_child_estimates(p_zips, p_min_age, p_max_age, p_year)
    ),
    z as (   -- de-duplicate: several ZIPs can map to one ZCTA
        select distinct on (zcta) * from e where found order by zcta
    )
    select
        (select max(e.acs_year) from e),
        (select count(*)::int from e),
        (select count(*)::int from z),
        coalesce((select array_agg(e.zip order by e.zip) from e where not e.found), '{}'),
        coalesce((select sum(z.est_children) from z), 0),
        coalesce((select sum(z.est_eligible_children) from z), 0),
        coalesce((select sum(z.est_eligible_u18) from z), 0),
        coalesce((select sum(z.est_eligible_u18) from z), 0) >= p_min_beneficiaries,
        (select count(*) > 0 and bool_and(z.median_hh_income is not null
                                          and z.median_hh_income < p_income_threshold) from z),
        coalesce((select array_agg(z.zcta order by z.zcta) from z
                  where z.median_hh_income is null
                     or z.median_hh_income >= p_income_threshold), '{}')
$$;

-- ZCTAs within a radius of a ZIP, nearest first (haversine on centroids).
create or replace function nearby_zctas(
    p_zip           text,
    p_radius_miles  double precision default 10,
    p_year          int default null
)
returns table (
    zcta              text,
    distance_miles    numeric,
    est_eligible_u18  numeric,
    median_hh_income  int,
    lat               double precision,
    lon               double precision
)
language sql stable as $$
    with origin as (
        select g.lat, g.lon
        from zcta_geo g
        where g.zcta = coalesce(
            (select x.zcta from zip_to_zcta x where x.zip = lpad(trim(p_zip), 5, '0')),
            lpad(trim(p_zip), 5, '0'))
    ),
    yr as (
        select coalesce(p_year, (select max(acs_year) from acs_zcta_children)) as y
    ),
    d as (
        select g.zcta, g.lat, g.lon,
               3958.8 * 2 * asin(sqrt(
                   power(sin(radians(g.lat - o.lat) / 2), 2) +
                   cos(radians(o.lat)) * cos(radians(g.lat)) *
                   power(sin(radians(g.lon - o.lon) / 2), 2))) as miles
        from zcta_geo g cross join origin o
        where g.lat between o.lat - p_radius_miles / 69.0 and o.lat + p_radius_miles / 69.0
    )
    select d.zcta::text,
           round(d.miles::numeric, 2),
           round(child_estimate(a, 0, 17) * citizen_share(a)),
           a.median_hh_income,
           d.lat, d.lon
    from d
    cross join yr
    join acs_zcta_children a on a.zcta = d.zcta and a.acs_year = yr.y
    where d.miles <= p_radius_miles
    order by d.miles
$$;

-- Starting from one ZIP, add the nearest ZCTAs until the area reaches the
-- 5,000-beneficiary minimum. Returns the suggested ZCTAs with running totals.
-- (Proximity-based; confirm contiguity before submitting to Treasury.)
create or replace function suggest_area(
    p_zip                text,
    p_min_beneficiaries  int default 5000,
    p_max_radius_miles   double precision default 30,
    p_year               int default null
)
returns table (
    zcta              text,
    distance_miles    numeric,
    est_eligible_u18  numeric,
    running_total     numeric,
    median_hh_income  int
)
language sql stable as $$
    with n as (
        select nz.*,
               sum(coalesce(nz.est_eligible_u18, 0)) over (order by nz.distance_miles, nz.zcta) as running_total
        from nearby_zctas(p_zip, p_max_radius_miles, p_year) nz
    )
    select n.zcta, n.distance_miles, n.est_eligible_u18, n.running_total, n.median_hh_income
    from n
    where n.running_total - coalesce(n.est_eligible_u18, 0) < p_min_beneficiaries
    order by n.distance_miles, n.zcta
$$;

-- ============================================================================
-- ZIP-level child population estimates for Trump Account general contributions
-- Source: U.S. Census Bureau, ACS 5-year estimates at ZCTA level
-- NOTE: These are ESTIMATES. Treasury determines the actual account
-- beneficiaries in a qualified class on each contribution's record date.
-- ============================================================================

-- Raw-ish ACS data, one row per ZCTA per ACS release year ---------------------
create table if not exists acs_zcta_children (
    zcta                char(5)  not null,
    acs_year            smallint not null,
    -- B09001: population under 18 in households, by age bucket
    age_0_2             integer,
    age_3_4             integer,
    age_5               integer,
    age_6_8             integer,
    age_9_11            integer,
    age_12_14           integer,
    age_15_17           integer,
    group_quarters_u18  integer,           -- B09001_010 (not split by age)
    total_u18           integer,           -- B09001_001
    total_u18_moe       integer,           -- margin of error (90%)
    -- B05003: under-18 by nativity / citizenship
    citizen_u18         integer,           -- native + naturalized
    noncitizen_u18      integer,
    -- B19013: median household income (inflation-adjusted to acs_year dollars)
    median_hh_income    integer,
    loaded_at           timestamptz not null default now(),
    primary key (zcta, acs_year)
);

-- ZCTA centroid + area (Census Gazetteer) for maps and "nearby ZIP" search ----
create table if not exists zcta_geo (
    zcta            char(5) primary key,
    lat             double precision not null,
    lon             double precision not null,
    land_sqmi       double precision,
    gazetteer_year  smallint not null,
    loaded_at       timestamptz not null default now()
);

-- Optional USPS ZIP -> ZCTA crosswalk (e.g. UDS Mapper). PO-box / unique ZIPs
-- have no ZCTA of their own; the crosswalk points them to their parent ZCTA.
create table if not exists zip_to_zcta (
    zip         char(5) primary key,
    zcta        char(5) not null,
    po_name     text,
    state       char(2),
    zip_type    text,
    source      text,
    loaded_at   timestamptz not null default now()
);

-- Audit log of pipeline runs --------------------------------------------------
create table if not exists pipeline_runs (
    id            bigserial primary key,
    job           text not null,
    params        jsonb,
    rows_loaded   integer,
    status        text not null,
    error         text,
    started_at    timestamptz not null default now(),
    finished_at   timestamptz
);

create index if not exists acs_zcta_children_year_idx on acs_zcta_children (acs_year);
create index if not exists zip_to_zcta_zcta_idx on zip_to_zcta (zcta);

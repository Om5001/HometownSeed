-- Nonprofits: people can register the 501(c)(3) they represent, and a coalition can
-- choose one of its members' nonprofits as its Qualified Donor (instead of Hometown
-- Seed's own). Organizations are checked against the IRS Exempt Organizations Business
-- Master File (loaded by `zipgive irs-orgs`) or ProPublica's Nonprofit Explorer API.

-- "I represent a 501(c)(3)" (asked at sign-up; shown as a check mark on the profile)
alter table app_users add column if not exists has_nonprofit boolean not null default false;

-- IRS EO Business Master File extract (https://www.irs.gov/pub/irs-soi/eo_XX.csv), by state.
create table if not exists irs_exempt_orgs (
    ein            char(9) primary key,
    name           text not null,
    street         text,
    city           text,
    state          char(2),
    zip            text,
    subsection     text,     -- '03' = 501(c)(3)
    deductibility  text,     -- '1' = contributions are deductible
    ruling         text,     -- YYYYMM of the IRS ruling
    foundation     text,     -- foundation code (e.g. 15/16/17 = public charity, 04 = private foundation)
    status         text,
    ntee_cd        text,
    asset_amt      bigint,
    income_amt     bigint,
    revenue_amt    bigint,
    loaded_at      timestamptz not null default now()
);
create index if not exists irs_exempt_orgs_state_name_idx on irs_exempt_orgs (state, name);

-- Nonprofits registered on Hometown Seed by the people who represent them.
create table if not exists nonprofits (
    id               uuid primary key default gen_random_uuid(),
    ein              char(9) not null unique,
    name             text not null check (length(name) between 2 and 200),
    address          text,
    city             text,
    state            char(2),
    zip              text,
    subsection       text,
    deductible       boolean,
    ntee_code        text,
    ruling           text,
    revenue_cents    bigint,
    verified_source  text not null default 'self' check (verified_source in ('irs', 'propublica', 'self')),
    verified_at      timestamptz,
    source_url       text,
    created_by       uuid references app_users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create table if not exists nonprofit_reps (
    nonprofit_id  uuid not null references nonprofits(id) on delete cascade,
    user_id       uuid not null references app_users(id) on delete cascade,
    title         text check (length(title) <= 100),
    phone         text check (length(phone) <= 40),
    created_at    timestamptz not null default now(),
    primary key (nonprofit_id, user_id)
);
create index if not exists nonprofit_reps_user_idx on nonprofit_reps (user_id);

-- A coalition's Qualified Donor: null = Hometown Seed's own 501(c)(3).
alter table pools add column if not exists donor_nonprofit_id uuid references nonprofits(id) on delete set null;
alter table pools add column if not exists donor_rep_user_id  uuid references app_users(id) on delete set null;
-- Section 4 signed by a member nonprofit's representative.
alter table treasury_submissions add column if not exists donor_signature jsonb;

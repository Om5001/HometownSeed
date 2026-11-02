-- ============================================================================
-- Hometown Seed application schema: people, campaigns, pledges, matching,
-- pooling, invites, and the records needed to submit to Treasury later.
-- Money is always stored as integer cents.
-- ============================================================================

-- Place names for ZIP areas (nearest Census place), filled by the pipeline.
alter table zcta_geo add column if not exists place_name  text;
alter table zcta_geo add column if not exists place_state char(2);

-- Program constants. Values come from Treasury guidance; VERIFY before launch.
create table if not exists program_rules (
    key         text primary key,
    value       numeric not null,
    note        text,
    updated_at  timestamptz not null default now()
);
insert into program_rules (key, value, note) values
    ('min_beneficiaries',     5000,  'Qualified geographic area minimum (IRC 530A(f)(3)(B))'),
    ('min_per_child_cents',   2500,  'Minimum general contribution per beneficiary, 2026-2027 (Notice 2025-68)'),
    ('income_threshold',      160000,'IRC 414(q) HCE amount used by the proposed ZIP income test'),
    ('max_age',               17,    'Beneficiaries are in their growth period (under 18)')
on conflict (key) do nothing;

create or replace function rule(p_key text) returns numeric
language sql stable as $$ select value from program_rules where key = p_key $$;

-- People ----------------------------------------------------------------------
-- Prototype accounts. In production, id = auth.users.id from Supabase Auth.
create table if not exists app_users (
    id            uuid primary key default gen_random_uuid(),
    email         text not null,
    display_name  text not null,
    created_at    timestamptz not null default now()
);
create unique index if not exists app_users_email_idx on app_users (lower(email));

-- Pools: campaigns that agreed to combine into one Treasury contribution ------
create table if not exists pools (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    min_age     smallint not null default 0,
    max_age     smallint not null default 17,
    created_by  uuid references app_users(id),
    created_at  timestamptz not null default now()
);

-- Campaigns -------------------------------------------------------------------
create table if not exists campaigns (
    id            uuid primary key default gen_random_uuid(),
    slug          text not null unique,
    name          text not null check (length(name) between 3 and 80),
    description   text check (length(description) <= 500),
    owner_id      uuid not null references app_users(id),
    -- how the organizer wants to run it
    mode          text not null default 'match' check (mode in ('solo', 'match', 'friends')),
    goal_cents    bigint not null check (goal_cents >= 10000),          -- $100 minimum
    min_age       smallint not null default 0  check (min_age between 0 and 17),
    max_age       smallint not null default 17 check (max_age between 0 and 17),
    status        text not null default 'active'
                  check (status in ('draft', 'active', 'funded', 'submitted', 'closed')),
    pool_id       uuid references pools(id) on delete set null,
    invite_code   text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
    is_demo       boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    check (min_age <= max_age)
);
create index if not exists campaigns_pool_idx on campaigns (pool_id);
create index if not exists campaigns_status_idx on campaigns (status);

create table if not exists campaign_zips (
    campaign_id  uuid not null references campaigns(id) on delete cascade,
    zcta         char(5) not null,
    added_by     text not null default 'organizer' check (added_by in ('organizer', 'suggested')),
    primary key (campaign_id, zcta)
);
create index if not exists campaign_zips_zcta_idx on campaign_zips (zcta);

create table if not exists campaign_members (
    campaign_id  uuid not null references campaigns(id) on delete cascade,
    user_id      uuid not null references app_users(id) on delete cascade,
    role         text not null default 'organizer' check (role in ('owner', 'organizer')),
    joined_at    timestamptz not null default now(),
    primary key (campaign_id, user_id)
);

-- Friend invites (link-based; optional email for a personal invite) ----------
create table if not exists invites (
    id           uuid primary key default gen_random_uuid(),
    campaign_id  uuid not null references campaigns(id) on delete cascade,
    email        text,
    created_by   uuid not null references app_users(id),
    accepted_by  uuid references app_users(id),
    created_at   timestamptz not null default now(),
    accepted_at  timestamptz
);

-- Requests to pool two campaigns (from matching) ------------------------------
create table if not exists pool_requests (
    id              uuid primary key default gen_random_uuid(),
    from_campaign   uuid not null references campaigns(id) on delete cascade,
    to_campaign     uuid not null references campaigns(id) on delete cascade,
    requested_by    uuid not null references app_users(id),
    message         text,
    status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at      timestamptz not null default now(),
    decided_at      timestamptz,
    check (from_campaign <> to_campaign)
);
create unique index if not exists pool_requests_open_idx
    on pool_requests (least(from_campaign, to_campaign), greatest(from_campaign, to_campaign))
    where status = 'pending';

-- Pledges and payments --------------------------------------------------------
-- 'pledged' = promise only (prototype). Payment states are set by the payment
-- provider webhook once real payments are connected.
create table if not exists pledges (
    id                uuid primary key default gen_random_uuid(),
    campaign_id       uuid not null references campaigns(id) on delete restrict,
    user_id           uuid references app_users(id),
    donor_name        text not null,
    donor_email       text,
    is_anonymous      boolean not null default false,
    amount_cents      bigint not null check (amount_cents >= 500),
    fee_cover_cents   bigint not null default 0 check (fee_cover_cents >= 0),
    message           text check (length(message) <= 280),
    status            text not null default 'pledged'
                      check (status in ('pledged', 'pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    payment_provider  text,           -- e.g. 'stripe', 'daf'
    payment_ref       text,           -- provider's payment/charge id
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists pledges_campaign_idx on pledges (campaign_id, status);

-- Append-only money ledger (filled by the payments integration). Every dollar's
-- path: donor -> charity account -> Treasury contribution (or refund).
create table if not exists ledger_entries (
    id           bigserial primary key,
    occurred_at  timestamptz not null default now(),
    entry_type   text not null check (entry_type in
                 ('donation', 'processing_fee', 'refund', 'grant_to_treasury', 'adjustment')),
    pledge_id    uuid references pledges(id),
    campaign_id  uuid references campaigns(id),
    pool_id      uuid references pools(id),
    amount_cents bigint not null,                 -- positive = into charity account
    external_ref text,
    memo         text
);

-- Treasury submissions: one per contribution sent to Treasury -----------------
create table if not exists treasury_submissions (
    id                    uuid primary key default gen_random_uuid(),
    pool_id               uuid references pools(id),
    campaign_id           uuid references campaigns(id),
    zctas                 char(5)[] not null,
    min_age               smallint not null,
    max_age               smallint not null,
    est_beneficiaries     integer not null,
    amount_cents          bigint not null,
    per_child_cents       bigint not null,
    status                text not null default 'draft'
                          check (status in ('draft', 'submitted', 'accepted', 'rejected', 'funded', 'distributed')),
    treasury_reference    text,
    record_date           date,
    official_beneficiaries integer,               -- Treasury's count on the record date
    submitted_at          timestamptz,
    decided_at            timestamptz,
    notes                 text,
    created_at            timestamptz not null default now(),
    check ((pool_id is null) <> (campaign_id is null))
);

-- Audit trail of important actions -------------------------------------------
create table if not exists audit_log (
    id          bigserial primary key,
    at          timestamptz not null default now(),
    actor_id    uuid references app_users(id),
    action      text not null,
    entity      text not null,
    entity_id   text,
    detail      jsonb
);

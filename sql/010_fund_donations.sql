-- Gifts to the Hometown Seed Fund: donations to Hometown Seed Foundation itself (the 501(c)(3)),
-- not to one campaign. The Fund adds to coalitions in the places donors choose (anywhere,
-- a state, or a ZIP code) when those coalitions go to Treasury, so every child's share stays equal.
-- Like campaign pledges, these are promises only until payments are connected.
create table if not exists fund_donations (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references app_users(id) on delete set null,
    donor_name     text not null check (length(donor_name) between 1 and 80),
    is_anonymous   boolean not null default false,
    amount_cents   bigint not null check (amount_cents >= 500),
    frequency      text not null default 'once' check (frequency in ('once', 'monthly')),
    designation    text not null default 'anywhere' check (designation in ('anywhere', 'state', 'zip')),
    state          char(2),
    zcta           char(5),
    message        text check (length(message) <= 280),
    status         text not null default 'pledged'
                   check (status in ('pledged', 'pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    created_at     timestamptz not null default now(),
    check ((designation = 'state') = (state is not null)),
    check ((designation = 'zip') = (zcta is not null))
);
create index if not exists fund_donations_user_idx on fund_donations (user_id);
alter table fund_donations enable row level security;

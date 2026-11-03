-- ============================================================================
-- Accounts (password sign-in + sessions), giving profiles, and swipe matching.
-- ============================================================================

-- Accounts --------------------------------------------------------------------
alter table app_users add column if not exists password_hash text;      -- scrypt; null = legacy prototype account
alter table app_users add column if not exists last_login_at timestamptz;

create table if not exists sessions (
    token_hash  text primary key,                    -- sha256 of the cookie token; the token itself is never stored
    user_id     uuid not null references app_users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    user_agent  text
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists login_attempts (
    id      bigserial primary key,
    email   text not null,
    ok      boolean not null,
    at      timestamptz not null default now()
);
create index if not exists login_attempts_email_idx on login_attempts (lower(email), at desc);

-- Giving profile: what each person wants to do ----------------------------------
-- Treasury classes can only be defined by place and birth year (age), so those are
-- the only targeting options. Income is used to choose AREAS, never individual kids.
create table if not exists giving_profiles (
    user_id          uuid primary key references app_users(id) on delete cascade,
    home_zip         char(5),
    radius_miles     integer not null default 25 check (radius_miles between 1 and 3000),
    target_zips      char(5)[] not null default '{}',
    gift_types       text[] not null default '{cash}'
                     check (gift_types <@ array['cash', 'stock', 'daf']::text[] and cardinality(gift_types) > 0),
    budget_cents     bigint check (budget_cents is null or budget_cents >= 0),
    per_child_cents  bigint check (per_child_cents is null or per_child_cents >= 0),
    min_age          smallint not null default 0  check (min_age between 0 and 17),
    max_age          smallint not null default 17 check (max_age between 0 and 17),
    income_focus     text not null default 'any' check (income_focus in ('any', 'below_threshold', 'lowest')),
    open_to_match    boolean not null default true,       -- show me to other people in their match deck
    bio              text check (length(bio) <= 280),
    anchor_lat       double precision,                   -- centroid of target ZIPs (or home ZIP); set on save
    anchor_lon       double precision,
    updated_at       timestamptz not null default now(),
    check (min_age <= max_age)
);

-- Swipes and mutual matches ------------------------------------------------------
create table if not exists swipes (
    user_id      uuid not null references app_users(id) on delete cascade,
    target_kind  text not null check (target_kind in ('campaign', 'person')),
    target_id    uuid not null,
    decision     text not null check (decision in ('like', 'pass')),
    created_at   timestamptz not null default now(),
    primary key (user_id, target_kind, target_id)
);
create index if not exists swipes_target_idx on swipes (target_kind, target_id, decision);

create or replace view v_connections as
select a.user_id, a.target_id as other_id, greatest(a.created_at, b.created_at) as matched_at
from swipes a
join swipes b on b.user_id = a.target_id and b.target_id = a.user_id
             and b.target_kind = 'person' and b.decision = 'like'
where a.target_kind = 'person' and a.decision = 'like';

-- The deck ----------------------------------------------------------------------
-- Campaigns and people ranked for one user. Priorities: location first, then
-- dollars per child, then age group, then gift type.
create or replace function match_deck(p_user uuid, p_limit int default 30)
returns table (
    kind            text,       -- 'campaign' | 'person'
    id              uuid,
    slug            text,
    title           text,
    subtitle        text,
    miles           numeric,
    per_child_cents numeric,
    kids            numeric,
    raised_cents    numeric,
    goal_cents      numeric,
    gift_types      text[],
    min_age         int,
    max_age         int,
    shared_zips     int,
    score           numeric,
    reasons         text[]
)
language sql stable set jit = off as $$
    with me as (
        select p.*, coalesce(p.target_zips, '{}') as tz
        from giving_profiles p where p.user_id = p_user
    ),
    camp as (
        select 'campaign'::text as kind, s.id, s.slug, s.name as title,
               coalesce((select string_agg(distinct coalesce(z.place_name || ', ' || z.place_state, 'ZIP ' || z.zcta), ' · ') from zcta_stats z where z.zcta = any(s.zctas::char(5)[])), '') as subtitle,
               s.lat, s.lon, s.goal_per_child_cents as pc, s.kids_in_class as kids,
               s.raised_cents::numeric as raised, s.goal_cents::numeric as goal,
               array['cash', 'stock', 'daf']::text[] as gifts, s.min_age::int as min_age, s.max_age::int as max_age,
               s.zctas::char(5)[] as zips, s.all_low_income,
               (select min(z.median_hh_income) from zcta_stats z where z.zcta = any(s.zctas::char(5)[])) as min_income
        from v_campaign_stats s
        where s.status = 'active'
          and not exists (select 1 from campaign_members m where m.campaign_id = s.id and m.user_id = p_user)
          and not exists (select 1 from swipes w where w.user_id = p_user and w.target_kind = 'campaign' and w.target_id = s.id)
    ),
    ppl as (
        select 'person'::text, g.user_id, null::text, u.display_name,
               coalesce((select z.place_name || ', ' || z.place_state from zcta_stats z where z.zcta = g.home_zip), 'Giving nationwide'),
               g.anchor_lat, g.anchor_lon, g.per_child_cents::numeric, null::numeric,
               null::numeric, g.budget_cents::numeric,
               g.gift_types, g.min_age::int, g.max_age::int,
               g.target_zips, null::boolean, null::int
        from giving_profiles g join app_users u on u.id = g.user_id
        where g.open_to_match and g.user_id <> p_user
          and not exists (select 1 from swipes w where w.user_id = p_user and w.target_kind = 'person' and w.target_id = g.user_id)
    ),
    cand as (select * from camp union all select * from ppl),
    scored as (
        select c.*,
               (select count(*)::int from unnest(c.zips) z where z = any(me.tz)) as shared,
               case when me.anchor_lat is null or c.lat is null then null
                    else miles_between(me.anchor_lat, me.anchor_lon, c.lat, c.lon) end as dist,
               me.radius_miles, me.per_child_cents as my_pc, me.gift_types as my_gifts,
               me.min_age as my_min, me.max_age as my_max, me.income_focus
        from cand c left join me on true
    ),
    calc as (
        select s.*,
               case when s.shared > 0 then 1.0
                    when s.dist is null then 0.4
                    else greatest(0, 1 - s.dist / (2.0 * coalesce(s.radius_miles, 25))) end as loc,
               case when s.my_pc is null or s.pc is null or s.pc = 0 or s.my_pc = 0 then 0.5
                    else 1 - abs(s.my_pc - s.pc) / greatest(s.my_pc, s.pc) end as amt,
               case when s.my_min is null then 1.0
                    when s.min_age = s.my_min and s.max_age = s.my_max then 1.0
                    when s.min_age <= s.my_max and s.max_age >= s.my_min then 0.5 else 0 end as age,
               case when s.my_gifts is null or s.gifts && s.my_gifts then 1.0 else 0.3 end as gift
        from scored s
    )
    select c.kind, c.id, c.slug, c.title, c.subtitle,
           round(c.dist::numeric, 1), round(c.pc), c.kids, c.raised, c.goal, c.gifts, c.min_age, c.max_age, c.shared,
           round((0.45 * c.loc + 0.30 * c.amt + 0.15 * c.age + 0.10 * c.gift
                  + case when c.income_focus = 'below_threshold' and c.all_low_income then 0.05
                         when c.income_focus = 'lowest' and c.min_income is not null then 0.05 * greatest(0, 1 - c.min_income / 120000.0)
                         else 0 end)::numeric, 3) as score,
           array_remove(array[
               case when c.shared > 0 then 'Same ZIP codes as you' end,
               case when c.shared = 0 and c.dist is not null and c.dist <= coalesce(c.radius_miles, 25) then round(c.dist::numeric) || ' miles from you' end,
               case when c.amt >= 0.8 and c.my_pc is not null and c.pc is not null then 'Similar $ per child' end,
               case when c.age = 1.0 and c.my_min is not null then 'Same age group' end,
               case when c.kind = 'person' and c.gift = 1.0 and c.my_gifts is not null then 'Gives the same way' end,
               case when c.income_focus = 'below_threshold' and c.all_low_income then 'All ZIPs below the income line' end
           ], null)
    from calc c
    where not (c.income_focus = 'below_threshold' and c.kind = 'campaign' and c.all_low_income is false)
    order by 15 desc, c.raised desc nulls last
    limit p_limit
$$;

-- The 5,000-child area minimum is in the statute (IRC 530A(f)(3)(B)). The $25 per child
-- comes from IRS Notice 2025-68 (application guidance for 2026-2027) and is not in the
-- statute or the Sept 2026 temporary regulations, so the app treats it as advisory.
-- Set the value to 0 to hide it.
update program_rules set note = 'Advisory: Treasury application minimum per beneficiary for 2026-2027 (IRS Notice 2025-68, Q&A H-2). Not in statute or temporary regs.'
where key = 'min_per_child_cents';
update program_rules set note = 'Required: qualified geographic area must have at least 5,000 account beneficiaries (IRC 530A(f)(3)(B)).'
where key = 'min_beneficiaries';

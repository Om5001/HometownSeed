-- ============================================================================
-- TEMPORARY DEMO DATA. Everything here is removed by sql/demo/remove_demo.sql.
--   * Demo people: emails @demo.hometownseed.org (fictional names). The shared
--     demo account is demo@demo.hometownseed.org (button on the sign-in page).
--   * Demo campaigns: campaigns.is_demo = true, in Dutchess County, NY ZIPs
--     12501 (Amenia), 12592 (Wassaic), 12522 (Dover Plains), 12545 (Millbrook).
--   * demo_notable_pledges: publicly reported pledges to Trump Accounts by
--     billionaires and others (real, sourced), shown as reference data.
-- Loaded by web/scripts/migrate.mjs unless DEMO_DATA=0. Safe to re-run.
-- ============================================================================

-- People ------------------------------------------------------------------------
insert into app_users (id, email, display_name, email_verified_at, has_nonprofit) values
 ('de000000-0000-4000-8000-000000000001', 'demo@demo.hometownseed.org',        'Demo Organizer',   now(), false),
 ('de000000-0000-4000-8000-000000000002', 'maria.alvarez@demo.hometownseed.org', 'Maria Alvarez',  now(), false),
 ('de000000-0000-4000-8000-000000000003', 'james.whitfield@demo.hometownseed.org','James Whitfield', now(), true),
 ('de000000-0000-4000-8000-000000000004', 'priya.raman@demo.hometownseed.org',  'Priya Raman',      now(), false),
 ('de000000-0000-4000-8000-000000000005', 'tom.oconnell@demo.hometownseed.org', 'Tom O''Connell',   now(), false),
 ('de000000-0000-4000-8000-000000000006', 'keisha.brooks@demo.hometownseed.org','Keisha Brooks',    now(), false),
 ('de000000-0000-4000-8000-000000000007', 'ben.hartley@demo.hometownseed.org',  'Ben Hartley',      now(), false),
 ('de000000-0000-4000-8000-000000000008', 'rosa.delgado@demo.hometownseed.org', 'Rosa Delgado',     now(), false),
 ('de000000-0000-4000-8000-000000000009', 'sam.okafor@demo.hometownseed.org',   'Sam Okafor',       now(), false),
 ('de000000-0000-4000-8000-000000000010', 'linda.chen@demo.hometownseed.org',   'Linda Chen',       now(), false)
on conflict do nothing;

-- Giving profiles (for the match deck) -------------------------------------------
insert into giving_profiles (user_id, home_zip, radius_miles, target_zips, gift_types, budget_cents, per_child_cents,
                             min_age, max_age, income_focus, open_to_match, bio, anchor_lat, anchor_lon)
select v.user_id::uuid, v.home_zip, v.radius, v.targets::char(5)[], v.gifts::text[], v.budget, v.pc, v.min_age, v.max_age, v.focus, true, v.bio,
       (select avg(lat) from zcta_stats z where z.zcta = any(v.targets::char(5)[])),
       (select avg(lon) from zcta_stats z where z.zcta = any(v.targets::char(5)[]))
from (values
 ('de000000-0000-4000-8000-000000000001', '12501', 25, '{12501,12592,12522}', '{cash}',        500000,  2500, 0, 17, 'any',             'Running the demo campaigns for the Harlem Valley.'),
 ('de000000-0000-4000-8000-000000000002', '12501', 15, '{12501}',             '{cash}',        100000,  2500, 0, 17, 'any',             'Grew up in Amenia; my kids go to Webutuck schools.'),
 ('de000000-0000-4000-8000-000000000003', '12545', 30, '{12545,12501}',       '{cash,daf}',   2500000,  5000, 0, 17, 'any',             'Board member of a local community foundation.'),
 ('de000000-0000-4000-8000-000000000004', '12522', 20, '{12522}',             '{cash}',         50000,  3000, 0, 10, 'below_threshold', 'Teacher in Dover Plains. Want every kid to start with something.'),
 ('de000000-0000-4000-8000-000000000005', '12592', 10, '{12592,12501}',       '{cash}',         25000,  2500, 0, 17, 'any',             'Wassaic volunteer firefighter.'),
 ('de000000-0000-4000-8000-000000000006', '12545', 25, '{12545}',             '{stock}',       300000,  2500, 6, 17, 'any',             'Giving appreciated stock to Millbrook kids.'),
 ('de000000-0000-4000-8000-000000000007', '12501', 40, '{12501,12522,12592}', '{cash,stock}',  750000,  2500, 0, 17, 'lowest',          'Small business owner on Route 22.'),
 ('de000000-0000-4000-8000-000000000008', '12522', 15, '{12522,12592}',       '{cash}',         20000,  2000, 0, 5,  'any',             'New mom in Dover Plains.'),
 ('de000000-0000-4000-8000-000000000009', '12545', 50, '{12545,12522}',       '{daf}',        1000000,  4000, 0, 17, 'any',             'Weekend Millbrook resident with a donor-advised fund.'),
 ('de000000-0000-4000-8000-000000000010', '12592', 30, '{12592,12545}',       '{cash}',         60000,  2500, 0, 17, 'below_threshold', 'Retired nurse, Wassaic.')
) as v(user_id, home_zip, radius, targets, gifts, budget, pc, min_age, max_age, focus, bio)
on conflict (user_id) do nothing;

-- Campaigns ---------------------------------------------------------------------------
insert into campaigns (id, slug, name, description, owner_id, mode, goal_type, goal_cents, goal_per_child_cents,
                       open_to_matching, invite_friends, is_demo) values
 ('de000000-0000-4000-9000-000000000001', 'demo-amenia-kids-fund', 'Amenia Kids Fund',
  'Seed every child''s Trump Account in Amenia. (Demo campaign.)', 'de000000-0000-4000-8000-000000000001',
  'match', 'per_child', 10000, 2500, true, true, true),
 ('de000000-0000-4000-9000-000000000002', 'demo-harlem-valley-seed', 'Harlem Valley Seed',
  'Amenia, Wassaic and Dover Plains together along Route 22. (Demo campaign.)', 'de000000-0000-4000-8000-000000000001',
  'match', 'total', 5000000, null, true, false, true),
 ('de000000-0000-4000-9000-000000000003', 'demo-millbrook-childrens-accounts', 'Millbrook Children''s Accounts',
  'Neighbors pooling for Millbrook kids. (Demo campaign.)', 'de000000-0000-4000-8000-000000000003',
  'match', 'total', 3000000, null, true, true, true),
 ('de000000-0000-4000-9000-000000000004', 'demo-dover-plains-starts-here', 'Dover Plains Starts Here',
  '$30 for every child in Dover Plains. (Demo campaign.)', 'de000000-0000-4000-8000-000000000004',
  'match', 'per_child', 10000, 3000, true, false, true),
 ('de000000-0000-4000-9000-000000000005', 'demo-wassaic-hamlet-fund', 'Wassaic Hamlet Fund',
  'A small hamlet with a big heart. (Demo campaign.)', 'de000000-0000-4000-8000-000000000005',
  'solo', 'open', null, null, false, false, true)
on conflict do nothing;

insert into campaign_members (campaign_id, user_id, role) values
 ('de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000001', 'owner'),
 ('de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000002', 'organizer'),
 ('de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000001', 'owner'),
 ('de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000003', 'owner'),
 ('de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000006', 'organizer'),
 ('de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000004', 'owner'),
 ('de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000005', 'owner')
on conflict do nothing;

insert into campaign_zips (campaign_id, zcta) values
 ('de000000-0000-4000-9000-000000000001', '12501'),
 ('de000000-0000-4000-9000-000000000002', '12501'), ('de000000-0000-4000-9000-000000000002', '12592'),
 ('de000000-0000-4000-9000-000000000002', '12522'),
 ('de000000-0000-4000-9000-000000000003', '12545'),
 ('de000000-0000-4000-9000-000000000004', '12522'),
 ('de000000-0000-4000-9000-000000000005', '12592')
on conflict do nothing;

insert into pledges (id, campaign_id, user_id, donor_name, donor_email, amount_cents, message) values
 ('de000000-0000-4000-a000-000000000001', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000002', 'Maria Alvarez',   null,  25000, 'For the kids on my street.'),
 ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000007', 'Ben Hartley',     null, 100000, null),
 ('de000000-0000-4000-a000-000000000003', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000007', 'Ben Hartley',     null, 250000, 'Route 22 strong.'),
 ('de000000-0000-4000-a000-000000000004', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000010', 'Linda Chen',      null,  30000, null),
 ('de000000-0000-4000-a000-000000000005', 'de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000009', 'Sam Okafor',      null, 500000, 'From our donor-advised fund.'),
 ('de000000-0000-4000-a000-000000000006', 'de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000006', 'Keisha Brooks',   null, 150000, null),
 ('de000000-0000-4000-a000-000000000007', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000008', 'Rosa Delgado',    null,  10000, 'For the babies.'),
 ('de000000-0000-4000-a000-000000000008', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000004', 'Priya Raman',     null,  20000, null),
 ('de000000-0000-4000-a000-000000000009', 'de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000005', 'Tom O''Connell',  null,  15000, null)
on conflict do nothing;

-- A fictional nonprofit represented by a demo person (for the Qualified Donor choice).
-- EIN 00-0000001 is a placeholder, not a real organization.
insert into nonprofits (id, ein, name, city, state, zip, subsection, deductible, verified_source, created_by) values
 ('de000000-0000-4000-b000-000000000001', '000000001', 'Harlem Valley Community Fund (demo)', 'Millbrook', 'NY', '12545', '03', true, 'self',
  'de000000-0000-4000-8000-000000000003')
on conflict do nothing;
insert into nonprofit_reps (nonprofit_id, user_id, title, phone) values
 ('de000000-0000-4000-b000-000000000001', 'de000000-0000-4000-8000-000000000003', 'Board Chair', '(845) 555-0100')
on conflict do nothing;

-- Someone already liked the demo account's campaign, so the demo has a match to show.
insert into swipes (user_id, target_kind, target_id, decision) values
 ('de000000-0000-4000-8000-000000000003', 'campaign', 'de000000-0000-4000-9000-000000000001', 'like'),
 ('de000000-0000-4000-8000-000000000007', 'person',   'de000000-0000-4000-8000-000000000001', 'like')
on conflict do nothing;

-- Publicly reported pledges to Trump Accounts (reference data, as of late October 2026) --
create table if not exists demo_notable_pledges (
    id           text primary key,
    donor        text not null,
    amount       text not null,          -- as reported
    per_child    text,
    form         text not null,          -- cash | stock
    scope        text not null,          -- national | state | employees | other
    state        char(2),                -- for state pledges
    min_age      smallint,
    max_age      smallint,
    income_max   integer,                -- ZIP median household income must be below this
    who          text not null,
    announced    text,
    source_name  text not null,
    source_url   text not null,
    sort         smallint not null default 100
);
alter table demo_notable_pledges enable row level security;
-- For the map layer: dollars per eligible child, when the recipients can be placed on a map.
alter table demo_notable_pledges add column if not exists per_child_cents integer;
alter table demo_notable_pledges add column if not exists map_layer boolean not null default false;
alter table demo_notable_pledges add column if not exists map_note text;
alter table demo_notable_pledges add column if not exists donor_type text;   -- person | foundation | company
alter table demo_notable_pledges add column if not exists zips text[];          -- scope 'zip': the ZIP codes
alter table demo_notable_pledges add column if not exists zip_prefixes text[];  -- scope 'city'/'county': 3-digit ZIP prefixes (approximate)
insert into demo_notable_pledges (id, donor, amount, per_child, form, scope, state, min_age, max_age, income_max, who, announced, source_name, source_url, sort, per_child_cents, map_layer, map_note) values
 ('dell', 'Michael & Susan Dell', '$6.25 billion', '$250', 'cash', 'national', null, 0, 10, 150000,
  'The first 25 million children age 10 and under who live in ZIP codes with median household income below $150,000.',
  'December 2025', 'TheStreet', 'https://www.thestreet.com/crypto/markets/101-donors-back-trump-accounts-full-list-revealed', 10, 25000, true, 'Capped at the first 25 million children, so not every eligible child may be reached.'),
 ('musk', 'Elon Musk', 'About $10.5 billion (one SpaceX share per child)', '1 SpaceX share', 'stock', 'national', null, 0, 17, null,
  'Every child in the U.S., per the announcement; Musk hasn''t said which children qualify or when (expected 2027). No Texas-specific component has been reported.',
  'October 19, 2026', 'Al Jazeera', 'https://aljazeera.com/news/2026/10/21/musk-pledges-10bn-in-spacex-shares-for-us-children-who-really-gains', 20, 14603, true, 'Valued at one SpaceX share at about $146 (price cited Oct 2026); the value moves with the stock.'),
 ('shotwell', 'Gwynne Shotwell & husband', 'About $320 million (one SpaceX share per child)', '1 SpaceX share', 'stock', 'national', 'TX', 11, 17, null,
  'More than 2 million children ages 11 to 17, with extra emphasis on lower-income families near their central Texas home.',
  'July 2026', 'The Next Web', 'https://thenextweb.com/news/shotwell-spacex-stock-trump-accounts', 30, null, false, 'Not mapped: covers about 2 million of the roughly 25 million children 11 to 17, and which ones isn''t public.'),
 ('dalio', 'Ray & Barbara Dalio (Dalio Philanthropies)', '$75 million', '$250', 'cash', 'state', 'CT', 0, 9, 150000,
  'About 300,000 Connecticut children under 10 in ZIP codes with median income under $150,000.',
  'December 2025', 'Fortune', 'https://www.fortune.com/2025/12/17/ray-dalio-75-million-donation-trump-accounts-treasuy', 40, 25000, true, null),
 ('gerstner', 'Brad Gerstner Family Foundation', '$250 per child (more than 140,000 eligible children)', '$250', 'cash', 'state', 'IN', 0, 4, null,
  'All Indiana children under age 5 with a Trump Account. Began reaching accounts in September 2026.',
  'September 23, 2026', 'Indiana House Republicans', 'https://www.indianahouserepublicans.com/blog/general/a-head-start-for-hoosier-kids/', 50, 25000, true, null),
 ('freedman', 'Ed Freedman (Stable Road Foundation)', '$250 per child', '$250', 'cash', 'state', 'HI', 11, 17, null,
  'Every eligible foster child in Hawaii ages 11 to 17, filling the gap above the Dell grant (ages 2 to 10). With Governor Josh Green and Invest America.',
  'July 2026', 'Stable Road Foundation', 'https://www.stableroadfoundation.org/in-the-news/ed-freedman-of-stable-road-foundation-joins-hawaii-public-radio-to-talk-investment-in-hawaiian-youth', 60, null, false, 'Not mapped: foster children can''t be placed by ZIP code.'),
 ('bisignano', 'Frank Bisignano (The Bisignano Family Fund)', '$250 per child', '$250', 'cash', 'zip', 'NY', 2, 8, null,
  'Children ages 2 to 8 living in ZIP code 11234 (Old Mill Basin, Brooklyn), his hometown ZIP. Deposited in their accounts on announcement.',
  'October 29, 2026', 'IRS', 'https://www.irs.gov/newsroom/frank-bisignano-donates-to-trump-accounts-for-children-in-brooklyn-ny', 45, 25000, true, null),
 ('sf_anon', 'Anonymous donor (San Francisco)', '$3.5 million', 'About $500', 'cash', 'city', 'CA', 0, 0, null,
  'Babies born in San Francisco in 2026, about $500 each, announced by Mayor Daniel Lurie.',
  '2026', 'San Francisco Chronicle', 'https://www.sfchronicle.com/sf/article/sf-donor-trump-accounts-21338065.php', 55, 50000, true, 'San Francisco: estimated as kids under 1 in 941xx ZIP codes.'),
 ('anand', 'Ajay Anand (Anand Legacy Foundation)', '$500,000', '$1,000', 'cash', 'county', 'CA', 0, 0, null,
  'Newborns in Kern County, California whose mothers are enrolled in eligible rehabilitation and recovery programs.',
  '2026', 'The Bakersfield Californian', 'https://www.bakersfield.com/news/trump-accounts-for-infants-get-local-backing/article_8569d546-13c7-4164-9a90-840b642301c1.amp.html', 58, null, false, 'Not mapped: limited to newborns of mothers in recovery programs, who can''t be placed by ZIP code.'),
 ('minaj', 'Nicki Minaj', '$150,000–$300,000 (reported)', null, 'cash', 'other', null, null, null, null,
  'Newborns of her fans; eligibility not specified.',
  'January 28, 2026', 'Newsweek', 'https://www.newsweek.com/list-of-billionaires-banks-and-businesses-contributing-to-trump-accounts-11435860', 70, null, false, null),
 ('hamm', 'Harold Hamm (Continental Resources)', 'Not stated', null, 'cash', 'employees', null, null, null, null,
  'Children of Continental Resources employees.',
  '2026', 'TheStreet', 'https://www.thestreet.com/crypto/markets/101-donors-back-trump-accounts-full-list-revealed', 80, null, false, null),
 ('employers', 'Employers (Bank of America, BlackRock, BNY, Charles Schwab, Dell, IBM, Intel, JPMorgan Chase, Nvidia, Visa, Wells Fargo and others)',
  'Matching contributions', null, 'cash', 'employees', null, null, null, null,
  'Employees'' children, typically matching the government''s $1,000 seed.',
  'January 28, 2026', 'Newsweek', 'https://www.newsweek.com/list-of-billionaires-banks-and-businesses-contributing-to-trump-accounts-11435860', 90, null, false, null)
on conflict (id) do update set donor = excluded.donor, amount = excluded.amount, per_child = excluded.per_child, form = excluded.form,
  scope = excluded.scope, state = excluded.state, min_age = excluded.min_age, max_age = excluded.max_age, income_max = excluded.income_max,
  who = excluded.who, announced = excluded.announced, source_name = excluded.source_name, source_url = excluded.source_url, sort = excluded.sort,
  per_child_cents = excluded.per_child_cents, map_layer = excluded.map_layer, map_note = excluded.map_note;
update demo_notable_pledges set donor_type = case id
  when 'dell' then 'foundation' when 'dalio' then 'foundation' when 'freedman' then 'foundation' when 'gerstner' then 'foundation'
  when 'bisignano' then 'foundation' when 'anand' then 'foundation' when 'sf_anon' then 'person'
  when 'musk' then 'person' when 'shotwell' then 'person' when 'minaj' then 'person'
  when 'hamm' then 'company' when 'employers' then 'company' else donor_type end;
update demo_notable_pledges set zips = '{11234}' where id = 'bisignano';
update demo_notable_pledges set zip_prefixes = '{941}' where id = 'sf_anon';
update demo_notable_pledges set zip_prefixes = '{933}' where id = 'anand';   -- Bakersfield-area ZIPs (all in Kern County)

-- A sample conversation in the demo account's inbox (only if the messaging tables exist).
do $$
begin
  if to_regclass('public.conversations') is not null then
    insert into conversations (id, kind, pair_key, campaign_id, created_by, created_at, last_message_at)
    values ('de000000-0000-4000-c000-000000000001', 'direct',
            'de000000-0000-4000-8000-000000000001:de000000-0000-4000-8000-000000000003',
            'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000003', now() - interval '2 days', now() - interval '1 day')
    on conflict do nothing;
    insert into conversation_members (conversation_id, user_id) values
      ('de000000-0000-4000-c000-000000000001', 'de000000-0000-4000-8000-000000000001'),
      ('de000000-0000-4000-c000-000000000001', 'de000000-0000-4000-8000-000000000003')
    on conflict do nothing;
    if not exists (select 1 from messages where conversation_id = 'de000000-0000-4000-c000-000000000001') then
      insert into messages (conversation_id, sender_id, body, created_at) values
        ('de000000-0000-4000-c000-000000000001', 'de000000-0000-4000-8000-000000000003',
         'Hi! I chair the Harlem Valley Community Fund (a 501(c)(3)) in Millbrook. Amenia plus Millbrook still won''t reach 5,000 kids, but if we pool with Dover Plains and Wassaic we get closer. Want to talk about combining, with our fund as the Qualified Donor?',
         now() - interval '2 days'),
        ('de000000-0000-4000-c000-000000000001', 'de000000-0000-4000-8000-000000000001',
         'Yes, that would be great. We''re at $25 per child in Amenia. Could you match that?', now() - interval '1 day');
    end if;
  end if;
end $$;

-- ============================================================================
-- More demo activity in the four Harlem Valley ZIPs (fictional people)
-- ============================================================================
insert into app_users (id, email, display_name, email_verified_at, has_nonprofit) values
 ('de000000-0000-4000-8000-000000000011', 'carmen.ruiz@demo.hometownseed.org',   'Carmen Ruiz',    now(), false),
 ('de000000-0000-4000-8000-000000000012', 'david.kim@demo.hometownseed.org',     'David Kim',      now(), false),
 ('de000000-0000-4000-8000-000000000013', 'grace.oneill@demo.hometownseed.org',  'Grace O''Neill', now(), false),
 ('de000000-0000-4000-8000-000000000014', 'marcus.bell@demo.hometownseed.org',   'Marcus Bell',    now(), false),
 ('de000000-0000-4000-8000-000000000015', 'elena.petrova@demo.hometownseed.org', 'Elena Petrova',  now(), false),
 ('de000000-0000-4000-8000-000000000016', 'hank.miller@demo.hometownseed.org',   'Hank Miller',    now(), false),
 ('de000000-0000-4000-8000-000000000017', 'aisha.grant@demo.hometownseed.org',   'Aisha Grant',    now(), false),
 ('de000000-0000-4000-8000-000000000018', 'noah.feld@demo.hometownseed.org',     'Noah Feld',      now(), false)
on conflict do nothing;

insert into giving_profiles (user_id, home_zip, radius_miles, target_zips, gift_types, budget_cents, per_child_cents,
                             min_age, max_age, income_focus, open_to_match, bio, anchor_lat, anchor_lon)
select v.user_id::uuid, v.home_zip, v.radius, v.targets::char(5)[], v.gifts::text[], v.budget, v.pc, v.min_age, v.max_age, v.focus, true, v.bio,
       (select avg(lat) from zcta_stats z where z.zcta = any(v.targets::char(5)[])),
       (select avg(lon) from zcta_stats z where z.zcta = any(v.targets::char(5)[]))
from (values
 ('de000000-0000-4000-8000-000000000011', '12522', 20, '{12501,12522,12592}', '{cash}',        200000, 2500, 0, 17, 'any',             'Webutuck parent; organizing families across the district.'),
 ('de000000-0000-4000-8000-000000000012', '12545', 15, '{12545}',             '{cash,stock}',  400000, 5000, 0, 5,  'any',             'Pediatrician in Millbrook. Starting with the littlest ones.'),
 ('de000000-0000-4000-8000-000000000013', '12501', 15, '{12501}',             '{cash}',         80000, 4000, 13, 17, 'any',            'Coach at the high school. Teens deserve a head start too.'),
 ('de000000-0000-4000-8000-000000000014', '12592', 30, '{12592,12501}',       '{cash}',         40000, 2500, 0, 17, 'below_threshold', 'Farmer outside Wassaic.'),
 ('de000000-0000-4000-8000-000000000015', '12545', 60, '{12545,12501,12522}', '{daf,stock}',  5000000, 10000, 0, 17, 'any',            'Weekend resident. Interested in a large matching gift for the valley.'),
 ('de000000-0000-4000-8000-000000000016', '12522', 10, '{12522}',             '{cash}',         15000, 2000, 0, 17, 'any',             'Retired trucker, Dover Plains born and raised.'),
 ('de000000-0000-4000-8000-000000000017', '12501', 25, '{12501,12592}',       '{cash}',         30000, 2500, 0, 10, 'lowest',          'Librarian. Kids 10 and under first.'),
 ('de000000-0000-4000-8000-000000000018', '12545', 40, '{12545,12522}',       '{stock}',       750000, 3000, 6, 17, 'any',             'Giving appreciated shares; happy to pool.')
) as v(user_id, home_zip, radius, targets, gifts, budget, pc, min_age, max_age, focus, bio)
on conflict (user_id) do nothing;

insert into campaigns (id, slug, name, description, owner_id, mode, goal_type, goal_cents, goal_per_child_cents,
                       open_to_matching, invite_friends, is_demo, min_age, max_age) values
 ('de000000-0000-4000-9000-000000000006', 'demo-webutuck-families-fund', 'Webutuck Families Fund',
  'Families across the Webutuck school district: Amenia, Wassaic and Dover Plains. (Demo campaign.)', 'de000000-0000-4000-8000-000000000011',
  'match', 'per_child', 10000, 2500, true, true, true, 0, 17),
 ('de000000-0000-4000-9000-000000000007', 'demo-millbrook-little-ones', 'Millbrook Little Ones (0–5)',
  'Seeding accounts for Millbrook''s youngest. (Demo campaign.)', 'de000000-0000-4000-8000-000000000012',
  'match', 'total', 1500000, null, true, false, true, 0, 5),
 ('de000000-0000-4000-9000-000000000008', 'demo-amenia-teens-start', 'Amenia Teens Start',
  '$40 for every Amenia teen before they turn 18. (Demo campaign.)', 'de000000-0000-4000-8000-000000000013',
  'match', 'per_child', 10000, 4000, true, false, true, 13, 17)
on conflict do nothing;

insert into campaign_members (campaign_id, user_id, role) values
 ('de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000011', 'owner'),
 ('de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000014', 'organizer'),
 ('de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000012', 'owner'),
 ('de000000-0000-4000-9000-000000000008', 'de000000-0000-4000-8000-000000000013', 'owner')
on conflict do nothing;

insert into campaign_zips (campaign_id, zcta) values
 ('de000000-0000-4000-9000-000000000006', '12501'), ('de000000-0000-4000-9000-000000000006', '12522'),
 ('de000000-0000-4000-9000-000000000006', '12592'),
 ('de000000-0000-4000-9000-000000000007', '12545'),
 ('de000000-0000-4000-9000-000000000008', '12501')
on conflict do nothing;

insert into pledges (id, campaign_id, user_id, donor_name, amount_cents, message, is_anonymous) values
 ('de000000-0000-4000-a000-000000000010', 'de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000016', 'Hank Miller',   5000, null, false),
 ('de000000-0000-4000-a000-000000000011', 'de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000017', 'Aisha Grant',  10000, 'For story time kids.', false),
 ('de000000-0000-4000-a000-000000000012', 'de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000015', 'Elena Petrova', 1000000, 'Happy to anchor this.', true),
 ('de000000-0000-4000-a000-000000000013', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000018', 'Noah Feld',   300000, null, false),
 ('de000000-0000-4000-a000-000000000014', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000012', 'David Kim',   150000, null, false),
 ('de000000-0000-4000-a000-000000000015', 'de000000-0000-4000-9000-000000000008', 'de000000-0000-4000-8000-000000000014', 'Marcus Bell',  20000, 'Go Warriors.', false),
 ('de000000-0000-4000-a000-000000000016', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000016', 'Hank Miller',   5000, null, false),
 ('de000000-0000-4000-a000-000000000017', 'de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000015', 'Elena Petrova', 500000, null, false)
on conflict do nothing;

-- A forming coalition: the demo account's Harlem Valley Seed pooled with Dover Plains Starts Here,
-- with a group chat. (Together they don't reach 5,000 kids yet; that's realistic for these ZIPs.)
insert into pools (id, name, min_age, max_age, created_by, status) values
 ('de000000-0000-4000-d000-000000000001', 'Harlem Valley Seed + Dover Plains Starts Here', 0, 17, 'de000000-0000-4000-8000-000000000001', 'forming')
on conflict do nothing;
update campaigns set pool_id = 'de000000-0000-4000-d000-000000000001'
 where id in ('de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-9000-000000000004') and pool_id is null;

do $$
begin
  if to_regclass('public.conversations') is not null then
    insert into conversations (id, kind, pool_id, created_by, created_at, last_message_at)
    values ('de000000-0000-4000-c000-000000000002', 'coalition', 'de000000-0000-4000-d000-000000000001',
            'de000000-0000-4000-8000-000000000004', now() - interval '3 days', now() - interval '5 hours')
    on conflict do nothing;
    insert into conversation_members (conversation_id, user_id)
      select 'de000000-0000-4000-c000-000000000002', user_id from coalition_people('de000000-0000-4000-d000-000000000001')
    on conflict do nothing;
    if not exists (select 1 from messages where conversation_id = 'de000000-0000-4000-c000-000000000002') then
      insert into messages (conversation_id, sender_id, body, created_at) values
        ('de000000-0000-4000-c000-000000000002', 'de000000-0000-4000-8000-000000000004',
         'Thanks for pooling with us! Together we cover Amenia, Wassaic and Dover Plains, but we''re still short of 5,000 kids.', now() - interval '3 days'),
        ('de000000-0000-4000-c000-000000000002', 'de000000-0000-4000-8000-000000000001',
         'Should we ask Millbrook Children''s Accounts to join? That adds about 1,200 kids.', now() - interval '2 days'),
        ('de000000-0000-4000-c000-000000000002', 'de000000-0000-4000-8000-000000000007',
         'I''m in either way. Happy to raise my pledge if we get there.', now() - interval '5 hours');
    end if;
  end if;
end $$;

-- ============================================================================
-- Real nonprofits based in these ZIPs (public IRS listings, for the directory).
-- They are NOT on Hometown Seed and haven't endorsed it; nobody here represents them.
-- EINs from ProPublica Nonprofit Explorer / IRS records.
-- ============================================================================
create table if not exists demo_local_nonprofits (
    ein         char(9) primary key,
    name        text not null,
    city        text not null,
    zip         char(5) not null,
    focus       text,
    source_url  text not null
);
alter table demo_local_nonprofits enable row level security;
insert into demo_local_nonprofits (ein, name, city, zip, focus, source_url) values
 ('141433751', 'Amenia Free Library Association',             'Amenia',       '12501', 'Public library',                 'https://projects.propublica.org/nonprofits/organizations/141433751'),
 ('141588216', 'Amenia Historical Society',                    'Amenia',       '12501', 'Local history',                  'https://projects.propublica.org/nonprofits/organizations/141588216'),
 ('861647727', 'Amenia-Wassaic Community Organization',        'Amenia',       '12501', 'Community organization',         'https://projects.propublica.org/nonprofits/organizations/861647727'),
 ('272691962', 'Wassaic Project',                              'Wassaic',      '12592', 'Arts, education and residencies', 'https://projects.propublica.org/nonprofits/organizations/272691962'),
 ('141493720', 'Dover Plains Library Association',             'Dover Plains', '12522', 'Public library',                 'https://projects.propublica.org/nonprofits/organizations/141493720'),
 ('223232968', 'Cary Institute of Ecosystem Studies',          'Millbrook',    '12545', 'Environmental research',         'https://projects.propublica.org/nonprofits/organizations/223232968'),
 ('136078769', 'Millbrook Library Trust',                      'Millbrook',    '12545', 'Library support',                'https://projects.propublica.org/nonprofits/organizations/136078769')
on conflict (ein) do update set name = excluded.name, city = excluded.city, zip = excluded.zip, focus = excluded.focus, source_url = excluded.source_url;

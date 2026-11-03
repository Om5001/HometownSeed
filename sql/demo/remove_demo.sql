-- Removes ALL demo data from sql/demo/seed_demo.sql. Run once before going live:
--   psql "$DATABASE_URL" -f sql/demo/remove_demo.sql
-- then set DEMO_DATA=0 and DEMO_ACCOUNT=0 (or delete the sql/demo folder and the
-- demo code marked TEMPORARY in web/).
begin;
-- campaigns marked as demo, with their pledges
select delete_campaign(id) from campaigns where is_demo;
-- pledges demo people made to anyone else's campaigns (promises only)
delete from pledges where user_id in (select id from app_users where email like '%@demo.hometownseed.org')
  and id not in (select pledge_id from ledger_entries where pledge_id is not null);
-- demo people (and everything attached to them)
select delete_account(id) from app_users where email like '%@demo.hometownseed.org';
-- the fictional demo nonprofit
delete from nonprofits where id = 'de000000-0000-4000-b000-000000000001';
-- coalitions left with no campaigns
delete from pools p where not exists (select 1 from campaigns c where c.pool_id = p.id)
  and not exists (select 1 from treasury_submissions t where t.pool_id = p.id);
drop table if exists demo_notable_pledges;
commit;

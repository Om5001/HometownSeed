-- Removes ALL demo data from sql/demo/seed_demo.sql. Run once before going live:
--   psql "$DATABASE_URL" -f sql/demo/remove_demo.sql
-- then set DEMO_DATA=0 and DEMO_ACCOUNT=0 (or delete the sql/demo folder and the
-- demo code marked TEMPORARY in web/).
begin;
-- the demo coalition and its chat
delete from conversations where pool_id = 'de000000-0000-4000-d000-000000000001';
update campaigns set pool_id = null where pool_id = 'de000000-0000-4000-d000-000000000001';
delete from pools where id = 'de000000-0000-4000-d000-000000000001';
-- campaigns marked as demo, with their pledges
select delete_campaign(id) from campaigns where is_demo;
-- pledges demo people made to anyone else's campaigns (promises only)
delete from pledges where user_id in (select id from app_users where email like '%@demo.hometownseed.org')
  and id not in (select pledge_id from ledger_entries where pledge_id is not null);
-- demo gifts to the Fund
delete from fund_donations where id::text like 'de000000-0000-4000-e000-%';
-- demo people (and everything attached to them)
select delete_account(id) from app_users where email like '%@demo.hometownseed.org';
-- the fictional demo nonprofit
delete from nonprofits where id = 'de000000-0000-4000-b000-000000000001';
-- coalitions left with no campaigns
delete from pools p where not exists (select 1 from campaigns c where c.pool_id = p.id)
  and not exists (select 1 from treasury_submissions t where t.pool_id = p.id);
-- conversations nobody is left in
delete from conversations c where c.kind = 'direct'
  and not exists (select 1 from conversation_members m where m.conversation_id = c.id);
drop table if exists demo_notable_pledges;
drop table if exists demo_local_nonprofits;
commit;

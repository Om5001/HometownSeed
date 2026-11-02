-- Everyone in a coalition signs its agreement, or leaves.
--
-- "Parties" are every signed-in person in the coalition: the organizers of each
-- campaign and everyone with an active pledge to one of them. The agreement is
-- frozen with that list; it's approved once all of them have signed. Anyone can
-- leave before it goes to Treasury, which draws up a new version for the rest.
-- Hometown Seed (a 501(c)(3)) is the Qualified Donor that applies to Treasury.

create table if not exists document_signatures (
    document_id  uuid not null references coalition_documents(id) on delete cascade,
    user_id      uuid not null references app_users(id) on delete cascade,
    signed_name  text not null check (length(signed_name) between 2 and 80),
    signed_at    timestamptz not null default now(),
    primary key (document_id, user_id)
);
alter table document_signatures enable row level security;

-- Everyone in a pool, with what they organize and what they've pledged.
create or replace function coalition_people(p_pool uuid)
returns table (user_id uuid, name text, email text, organizer_of text[], owner_of text[], pledged_cents bigint)
language sql stable as $$
    with x as (
        select m.user_id, c.name as org, case when m.role = 'owner' then c.name end as own, 0::bigint as amt, m.joined_at as t
        from campaign_members m join campaigns c on c.id = m.campaign_id
        where c.pool_id = p_pool
        union all
        select p.user_id, null, null, p.amount_cents, p.created_at
        from pledges p join campaigns c on c.id = p.campaign_id
        where c.pool_id = p_pool and p.user_id is not null and p.status in ('pledged', 'pending', 'succeeded')
    )
    select u.id, u.display_name, u.email,
           coalesce(array_agg(distinct x.org) filter (where x.org is not null), '{}'),
           coalesce(array_agg(distinct x.own) filter (where x.own is not null), '{}'),
           sum(x.amt)::bigint
    from x join app_users u on u.id = x.user_id
    group by u.id, u.display_name, u.email
    order by min(x.t)
$$;

-- Delete a campaign that hasn't gone to Treasury. Pledges are promises only (no
-- money has moved), so they're removed with it. Returns the pool it was in.
create or replace function delete_campaign(p_campaign uuid) returns uuid
language plpgsql as $$
declare
    v_pool uuid;
begin
    select pool_id into v_pool from campaigns where id = p_campaign;
    if exists (select 1 from ledger_entries where campaign_id = p_campaign
               or pledge_id in (select id from pledges where campaign_id = p_campaign)) then
        raise exception 'This campaign has payment records, so it can only be closed, not deleted.' using errcode = 'P0001';
    end if;
    update treasury_submissions set campaign_id = null where campaign_id = p_campaign;
    delete from swipes where target_kind = 'campaign' and target_id = p_campaign;
    delete from pledges where campaign_id = p_campaign;
    delete from campaigns where id = p_campaign;
    insert into audit_log (actor_id, action, entity, entity_id) values (null, 'campaign.delete', 'campaign', p_campaign::text);
    return v_pool;
end $$;

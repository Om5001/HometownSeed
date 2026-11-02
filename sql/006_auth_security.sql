-- ============================================================================
-- Account security: email verification, password reset, account deletion,
-- login throttling by IP, and locking the database down from public access.
-- This file runs last so its lock-down covers every table and view.
-- ============================================================================

alter table app_users add column if not exists email_verified_at   timestamptz;
alter table app_users add column if not exists password_changed_at timestamptz;

-- One-time links for email verification and password reset. Only a SHA-256 of
-- each token is stored, so a database leak can't be used to verify or reset.
create table if not exists auth_tokens (
    token_hash  text primary key,
    user_id     uuid not null references app_users(id) on delete cascade,
    purpose     text not null check (purpose in ('verify_email', 'reset_password')),
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    used_at     timestamptz
);
create index if not exists auth_tokens_user_idx on auth_tokens (user_id, purpose);

alter table login_attempts add column if not exists ip text;
create index if not exists login_attempts_ip_idx on login_attempts (ip, at desc);

-- Let accounts be deleted without breaking campaign and money records ---------
alter table campaigns alter column owner_id drop not null;
alter table pool_requests alter column requested_by drop not null;

alter table campaigns      drop constraint if exists campaigns_owner_id_fkey,
                           add  constraint campaigns_owner_id_fkey foreign key (owner_id) references app_users(id) on delete set null;
alter table pledges        drop constraint if exists pledges_user_id_fkey,
                           add  constraint pledges_user_id_fkey foreign key (user_id) references app_users(id) on delete set null;
alter table invites        drop constraint if exists invites_created_by_fkey,
                           add  constraint invites_created_by_fkey foreign key (created_by) references app_users(id) on delete cascade;
alter table invites        drop constraint if exists invites_accepted_by_fkey,
                           add  constraint invites_accepted_by_fkey foreign key (accepted_by) references app_users(id) on delete set null;
alter table pool_requests  drop constraint if exists pool_requests_requested_by_fkey,
                           add  constraint pool_requests_requested_by_fkey foreign key (requested_by) references app_users(id) on delete set null;
alter table pools          drop constraint if exists pools_created_by_fkey,
                           add  constraint pools_created_by_fkey foreign key (created_by) references app_users(id) on delete set null;
alter table audit_log      drop constraint if exists audit_log_actor_id_fkey,
                           add  constraint audit_log_actor_id_fkey foreign key (actor_id) references app_users(id) on delete set null;

-- Delete an account. Campaigns pass to a co-organizer; a campaign with no one
-- left is deleted if it has no pledges, otherwise closed (pledge records must
-- stay for the charity's books). The person's pledges are kept but anonymized.
create or replace function delete_account(p_user uuid) returns void
language plpgsql as $$
declare
    v_email text;
    c record;
    heir uuid;
begin
    select email into v_email from app_users where id = p_user;
    if v_email is null then return; end if;

    for c in select id from campaigns where owner_id = p_user loop
        select m.user_id into heir from campaign_members m
        where m.campaign_id = c.id and m.user_id <> p_user
        order by m.joined_at limit 1;
        if heir is not null then
            update campaigns set owner_id = heir, updated_at = now() where id = c.id;
            update campaign_members set role = 'owner' where campaign_id = c.id and user_id = heir;
        elsif not exists (select 1 from pledges where campaign_id = c.id) then
            delete from campaigns where id = c.id;
        else
            update campaigns set status = 'closed', owner_id = null, updated_at = now() where id = c.id;
        end if;
    end loop;

    update pledges set donor_name = 'Deleted account', donor_email = null, is_anonymous = true, user_id = null
    where user_id = p_user;
    delete from swipes where target_kind = 'person' and target_id = p_user;
    delete from pool_requests where requested_by = p_user and status = 'pending';
    delete from invites where lower(email) = lower(v_email) and accepted_by is null;
    delete from login_attempts where lower(email) = lower(v_email);
    insert into audit_log (actor_id, action, entity, entity_id) values (null, 'account.delete', 'user', p_user::text);
    delete from app_users where id = p_user;   -- sessions, tokens, profile, swipes, memberships cascade
end $$;

-- Lock the database down ------------------------------------------------------
-- Supabase publishes every table in "public" through its REST API to anyone
-- holding the project's public (anon) key. The app talks to Postgres directly
-- as the table owner, so nothing needs that API: turn on row-level security
-- with no policies (deny all) and remove the API roles' access entirely.
do $$
declare t record;
begin
    for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table public.%I enable row level security', t.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema public from anon, authenticated';
        execute 'revoke all on all sequences in schema public from anon, authenticated';
        execute 'revoke execute on all functions in schema public from anon, authenticated, public';
        execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
        execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
        execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated, public';
    end if;
end $$;

-- ============================================================================
-- Runs last on every migrate, so it covers every table, view and function.
-- ============================================================================
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

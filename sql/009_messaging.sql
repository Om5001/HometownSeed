-- Messaging: one-to-one conversations between people on Hometown Seed, and one group
-- chat per coalition. Anyone can message a person who's discoverable (open to matching,
-- organizing an active campaign, representing a nonprofit, or in a shared coalition);
-- no mutual "match" is needed. People can block each other.

create table if not exists conversations (
    id               uuid primary key default gen_random_uuid(),
    kind             text not null check (kind in ('direct', 'coalition')),
    pair_key         text unique,                                         -- direct: "<smaller uuid>:<larger uuid>"
    pool_id          uuid unique references pools(id) on delete cascade,  -- coalition chat
    campaign_id      uuid references campaigns(id) on delete set null,    -- what a direct chat started about
    created_by       uuid references app_users(id) on delete set null,
    created_at       timestamptz not null default now(),
    last_message_at  timestamptz not null default now(),
    check ((kind = 'direct') = (pair_key is not null)),
    check ((kind = 'coalition') = (pool_id is not null))
);
create index if not exists conversations_created_by_idx on conversations (created_by, created_at);

create table if not exists conversation_members (
    conversation_id  uuid not null references conversations(id) on delete cascade,
    user_id          uuid not null references app_users(id) on delete cascade,
    last_read_at     timestamptz not null default 'epoch',
    notified_at      timestamptz,                    -- last "you have a new message" email
    primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on conversation_members (user_id);

create table if not exists messages (
    id               bigserial primary key,
    conversation_id  uuid not null references conversations(id) on delete cascade,
    sender_id        uuid references app_users(id) on delete set null,
    body             text not null check (length(body) between 1 and 4000),
    created_at       timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages (conversation_id, id);

create table if not exists user_blocks (
    blocker_id  uuid not null references app_users(id) on delete cascade,
    blocked_id  uuid not null references app_users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
);

-- Unread messages per conversation for one person.
create or replace function unread_counts(p_user uuid)
returns table (conversation_id uuid, unread int)
language sql stable set jit = off as $$
    select m.conversation_id, count(x.id)::int
    from conversation_members m
    join messages x on x.conversation_id = m.conversation_id
                   and x.created_at > m.last_read_at
                   and x.sender_id is distinct from p_user
    where m.user_id = p_user
    group by m.conversation_id
$$;

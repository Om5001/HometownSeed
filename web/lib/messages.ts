/**
 * Messaging. Direct conversations between two people, plus one group chat per coalition.
 *
 * You can message anyone who's discoverable: open to matching on their profile, organizing
 * an active campaign, representing a nonprofit, or in a coalition with you. No mutual
 * "match" is needed. Guard rails: blocking, a daily limit on new conversations, and email
 * addresses are never shown.
 */
import { db } from "./db";
import { HttpError } from "./http";
import { sendEmail } from "./email";
import type { User } from "./auth";

type Sql = ReturnType<typeof db>;
const NEW_CONVERSATIONS_PER_DAY = 15;
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const cleanBody = (v: unknown) => {
  const b = String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
  if (!b) throw new HttpError(400, "Write a message first.");
  return b;
};

export type ConversationRow = {
  id: string; kind: "direct" | "coalition"; title: string; subtitle: string | null; other_id: string | null;
  last_message_at: string; last_body: string | null; last_sender: string | null; unread: number; pool_id: string | null; campaign_slug: string | null;
};
export type MessageRow = { id: number; sender_id: string | null; sender_name: string; body: string; created_at: string; mine: boolean };

async function blockedEitherWay(sql: Sql, a: string, b: string) {
  const [x] = await sql`select 1 from user_blocks where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a})`;
  return !!x;
}

/** Can `from` start a conversation with `to`? */
async function assertContactable(sql: Sql, from: string, to: string) {
  if (from === to) throw new HttpError(400, "That's you.");
  const [t] = await sql<{ ok: boolean }[]>`
    select (
      exists (select 1 from giving_profiles g where g.user_id = u.id and g.open_to_match)
      or exists (select 1 from campaign_members m join campaigns c on c.id = m.campaign_id where m.user_id = u.id and c.status = 'active')
      or exists (select 1 from nonprofit_reps r where r.user_id = u.id)
      or exists (select 1 from campaigns c where c.pool_id is not null
                   and exists (select 1 from coalition_people(c.pool_id) a where a.user_id = u.id)
                   and exists (select 1 from coalition_people(c.pool_id) b where b.user_id = ${from}))
    ) as ok
    from app_users u where u.id = ${to}`;
  if (!t) throw new HttpError(404, "That person isn't on Hometown Seed anymore.");
  if (!t.ok) throw new HttpError(403, "This person isn't accepting messages.");
  if (await blockedEitherWay(sql, from, to)) throw new HttpError(403, "You can't message this person.");
}

/** Start (or reopen) a conversation with a person, or with a campaign's organizer, and send the first message. */
export async function startConversation(user: User, b: { to?: unknown; campaign?: unknown; body?: unknown }, base: string) {
  const sql = db();
  const body = cleanBody(b.body);
  let to = String(b.to ?? ""), campaignId: string | null = null;
  if (b.campaign) {
    const [c] = await sql<{ id: string; owner_id: string | null }[]>`select id, owner_id from campaigns where slug = ${String(b.campaign)}`;
    if (!c) throw new HttpError(404, "Campaign not found.");
    campaignId = c.id;
    if (!to) {
      const [m] = await sql<{ user_id: string }[]>`
        select user_id from campaign_members where campaign_id = ${c.id} and user_id <> ${user.id} order by role = 'owner' desc, joined_at limit 1`;
      if (!m) throw new HttpError(400, "You organize this campaign.");
      to = m.user_id;
    }
  }
  if (!/^[0-9a-f-]{36}$/.test(to)) throw new HttpError(400, "Who is this message for?");
  await assertContactable(sql, user.id, to);
  const key = pairKey(user.id, to);
  const [existing] = await sql<{ id: string }[]>`select id from conversations where pair_key = ${key}`;
  let id = existing?.id;
  if (!id) {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from conversations where created_by = ${user.id} and created_at > now() - interval '1 day'`;
    if (n >= NEW_CONVERSATIONS_PER_DAY) throw new HttpError(429, "You've started a lot of conversations today. Try again tomorrow.");
    id = await sql.begin(async (tx) => {
      const [c] = await tx<{ id: string }[]>`
        insert into conversations (kind, pair_key, campaign_id, created_by) values ('direct', ${key}, ${campaignId}, ${user.id})
        on conflict (pair_key) do update set pair_key = excluded.pair_key returning id`;
      await tx`insert into conversation_members (conversation_id, user_id) values (${c.id}, ${user.id}), (${c.id}, ${to})
               on conflict do nothing`;
      return c.id;
    });
  }
  await sendMessage(user, id!, body, base);
  return { id };
}

async function access(sql: Sql, user: User, conversationId: string) {
  const [c] = await sql<{ id: string; kind: "direct" | "coalition"; pool_id: string | null }[]>`
    select id, kind, pool_id from conversations where id = ${conversationId}`;
  if (!c) throw new HttpError(404, "Conversation not found.");
  if (c.kind === "coalition") {
    const [p] = await sql`select 1 from coalition_people(${c.pool_id}) where user_id = ${user.id}`;
    if (!p) throw new HttpError(403, "Only people in this coalition can see its chat.");
    await sql`insert into conversation_members (conversation_id, user_id) values (${c.id}, ${user.id}) on conflict do nothing`;
  } else {
    const [m] = await sql`select 1 from conversation_members where conversation_id = ${c.id} and user_id = ${user.id}`;
    if (!m) throw new HttpError(403, "This isn't your conversation.");
  }
  return c;
}

export async function sendMessage(user: User, conversationId: string, rawBody: unknown, base: string) {
  const sql = db();
  const body = cleanBody(rawBody);
  const c = await access(sql, user, conversationId);
  if (c.kind === "direct") {
    const [other] = await sql<{ user_id: string }[]>`select user_id from conversation_members where conversation_id = ${c.id} and user_id <> ${user.id}`;
    if (!other) throw new HttpError(400, "The other person has left Hometown Seed.");
    if (await blockedEitherWay(sql, user.id, other.user_id)) throw new HttpError(403, "You can't message this person.");
  } else {
    // everyone in the coalition gets the chat in their inbox
    await sql`insert into conversation_members (conversation_id, user_id)
              select ${c.id}, user_id from coalition_people(${c.pool_id}) on conflict do nothing`;
  }
  const [m] = await sql<{ id: number }[]>`
    insert into messages (conversation_id, sender_id, body) values (${c.id}, ${user.id}, ${body}) returning id`;
  await sql`update conversations set last_message_at = now() where id = ${c.id}`;
  await sql`update conversation_members set last_read_at = now() where conversation_id = ${c.id} and user_id = ${user.id}`;
  notify(c.id, user, body, base).catch((e) => console.warn("[messages] notify failed:", (e as Error).message));
  return { id: m.id };
}

/** Email people about new messages, at most once an hour per conversation, if they haven't read it. */
async function notify(conversationId: string, sender: User, body: string, base: string) {
  const sql = db();
  const due = await sql<{ user_id: string; email: string; name: string }[]>`
    update conversation_members m set notified_at = now()
    from app_users u
    where m.conversation_id = ${conversationId} and m.user_id = u.id and m.user_id <> ${sender.id}
      and m.last_read_at < now() - interval '2 minutes'
      and (m.notified_at is null or m.notified_at < now() - interval '1 hour')
      and u.email not like '%@demo.hometownseed.org'
    returning u.id as user_id, u.email, u.display_name as name`;
  const link = `${base}/messages/${conversationId}`;
  const preview = body.length > 280 ? body.slice(0, 277) + "…" : body;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  for (const r of due) {
    await sendEmail({
      to: r.email, link, subject: `New message from ${sender.display_name} on Hometown Seed`,
      text: `Hi ${r.name},\n\n${sender.display_name} wrote:\n\n${preview}\n\nReply here: ${link}`,
      html: `<p>Hi ${esc(r.name)},</p><p><b>${esc(sender.display_name)}</b> wrote:</p><blockquote>${esc(preview).replace(/\n/g, "<br>")}</blockquote><p><a href="${esc(link)}">Reply on Hometown Seed</a></p>`,
    });
  }
}

export async function listConversations(user: User): Promise<ConversationRow[]> {
  const sql = db();
  return sql<ConversationRow[]>`
    select c.id, c.kind, c.pool_id, c.last_message_at,
           case when c.kind = 'coalition' then coalesce(p.name, 'Coalition') || ' (coalition chat)'
                else coalesce(o.display_name, 'Deleted account') end as title,
           case when c.kind = 'direct' and cp.name is not null then 'About ' || cp.name end as subtitle,
           cp.slug as campaign_slug,
           o.id as other_id,
           lm.body as last_body, coalesce(su.display_name, case when lm.id is not null then 'Deleted account' end) as last_sender,
           coalesce(uc.unread, 0) as unread
    from conversation_members me
    join conversations c on c.id = me.conversation_id
    left join pools p on p.id = c.pool_id
    left join campaigns cp on cp.id = c.campaign_id
    left join lateral (select u.id, u.display_name from conversation_members x join app_users u on u.id = x.user_id
                       where c.kind = 'direct' and x.conversation_id = c.id and x.user_id <> ${user.id} limit 1) o on true
    left join lateral (select id, body, sender_id from messages where conversation_id = c.id order by id desc limit 1) lm on true
    left join app_users su on su.id = lm.sender_id
    left join unread_counts(${user.id}) uc on uc.conversation_id = c.id
    where me.user_id = ${user.id}
      and (c.kind = 'direct' or exists (select 1 from coalition_people(c.pool_id) a where a.user_id = ${user.id}))
    order by c.last_message_at desc
    limit 200`;
}

/** Messages in a conversation (newest 200, or those after `after`), and marks them read. */
export async function getThread(user: User, conversationId: string, after = 0) {
  const sql = db();
  const c = await access(sql, user, conversationId);
  const rows = await sql<MessageRow[]>`
    select * from (
      select m.id::int as id, m.sender_id, coalesce(u.display_name, 'Deleted account') as sender_name, m.body, m.created_at,
             (m.sender_id = ${user.id}) as mine
      from messages m left join app_users u on u.id = m.sender_id
      where m.conversation_id = ${c.id} and m.id > ${after}
      order by m.id desc limit 200) t
    order by id`;
  await sql`update conversation_members set last_read_at = now() where conversation_id = ${c.id} and user_id = ${user.id}`;
  return { kind: c.kind, pool_id: c.pool_id, messages: rows };
}

export async function unreadTotal(userId: string): Promise<number> {
  const [r] = await db()<{ n: number }[]>`select coalesce(sum(unread), 0)::int as n from unread_counts(${userId})`;
  return r?.n ?? 0;
}

/** The coalition's group chat (created on first use). */
export async function coalitionChat(user: User, poolId: string) {
  const sql = db();
  const [p] = await sql`select 1 from coalition_people(${poolId}) where user_id = ${user.id}`;
  if (!p) throw new HttpError(403, "Only people in this coalition can open its chat.");
  const [c] = await sql<{ id: string }[]>`
    insert into conversations (kind, pool_id, created_by) values ('coalition', ${poolId}, ${user.id})
    on conflict (pool_id) do update set pool_id = excluded.pool_id returning id`;
  await sql`insert into conversation_members (conversation_id, user_id) values (${c.id}, ${user.id}) on conflict do nothing`;
  return { id: c.id };
}

export async function blockUser(user: User, otherId: string, block: boolean) {
  const sql = db();
  if (otherId === user.id) throw new HttpError(400, "That's you.");
  if (block) await sql`insert into user_blocks (blocker_id, blocked_id) values (${user.id}, ${otherId}) on conflict do nothing`;
  else await sql`delete from user_blocks where blocker_id = ${user.id} and blocked_id = ${otherId}`;
  return { blocked: block };
}

export async function isBlocked(userId: string, otherId: string) {
  const [x] = await db()`select 1 from user_blocks where blocker_id = ${userId} and blocked_id = ${otherId}`;
  return !!x;
}

/**
 * Coalitions: one or more campaigns going to Treasury together.
 *
 * Tracker: 1 Campaign created -> 2 Coalition formed -> 3 Treasury approval -> 4 Money sent.
 * - Step 2: every campaign in the pool confirms "we're ready", and the combined area has
 *   5,000+ kids (the legal minimum). A campaign on its own can be a coalition of one.
 * - Step 3: the app freezes a coalition agreement (who, where, how much) and every campaign's
 *   organizer approves that exact version. Any change to membership starts over.
 * - Step 4: an approved coalition gets a Treasury submission draft for the partner charity.
 */
import crypto from "node:crypto";
import { db } from "./db";
import { HttpError } from "./http";
import { getRules } from "./queries";
import type { User } from "./auth";

export type Stage = "created" | "coalition" | "approval" | "send" | "done";
export type CoalitionState = {
  pool: { id: string; name: string; status: string; kids_u18: number; kids: number; raised: number; meets_min: boolean; zip_count: number } | null;
  campaigns: { id: string; slug: string; name: string; confirmed: boolean; approved: boolean }[];
  document: { id: string; version: number; content_hash: string; created_at: string } | null;
  stage: Stage;
};

export async function coalitionState(campaign: { id: string; pool_id: string | null; meets_min: boolean }): Promise<CoalitionState> {
  const sql = db();
  if (!campaign.pool_id) return { pool: null, campaigns: [], document: null, stage: "coalition" };
  const [pool] = await sql<NonNullable<CoalitionState["pool"]>[]>`
    select id, name, status, kids_u18::float8 as kids_u18, kids_in_class::float8 as kids, raised_cents::float8 as raised, meets_min, zip_count
    from v_pool_stats where id = ${campaign.pool_id}`;
  const [doc] = await sql<NonNullable<CoalitionState["document"]>[]>`
    select id, version, content_hash, created_at from coalition_documents where pool_id = ${campaign.pool_id} and status = 'active'
    order by version desc limit 1`;
  const campaigns = await sql<CoalitionState["campaigns"]>`
    select c.id, c.slug, c.name,
           exists (select 1 from coalition_confirmations k where k.pool_id = c.pool_id and k.campaign_id = c.id) as confirmed,
           ${doc ? sql`exists (select 1 from document_approvals a where a.document_id = ${doc.id} and a.campaign_id = c.id)` : sql`false`} as approved
    from campaigns c where c.pool_id = ${campaign.pool_id} order by c.created_at`;
  // Tracker: 2 Coalition formed (confirm + sign agreement) -> 3 Treasury approval -> 4 Money sent
  const stage: Stage = ["forming", "confirmed"].includes(pool.status) ? "coalition"
    : ["approved", "submitted", "rejected"].includes(pool.status) ? "approval"
    : ["accepted", "funded"].includes(pool.status) ? "send" : "done";
  return { pool, campaigns, document: doc ?? null, stage };
}

async function assertOrganizer(campaignId: string, userId: string) {
  const [m] = await db()`select 1 from campaign_members where campaign_id = ${campaignId} and user_id = ${userId}`;
  if (!m) throw new HttpError(403, "Only this campaign's organizers can do that.");
}

/** Step 2: this campaign is ready to go to Treasury with its coalition. */
export async function confirmCoalition(user: User, slug: string) {
  const sql = db();
  const [c] = await sql<{ id: string; name: string; pool_id: string | null; min_age: number; max_age: number; status: string; meets_min: boolean }[]>`
    select id, name, pool_id, min_age, max_age, status, meets_min from v_campaign_stats where slug = ${slug}`;
  if (!c) throw new HttpError(404, "Campaign not found.");
  if (c.status !== "active") throw new HttpError(400, "This campaign isn't active.");
  await assertOrganizer(c.id, user.id);
  const rules = await getRules();

  return sql.begin(async (tx) => {
    let poolId = c.pool_id;
    if (!poolId) {  // a campaign on its own becomes a coalition of one
      [{ id: poolId }] = await tx<{ id: string }[]>`
        insert into pools (name, min_age, max_age, created_by) values (${c.name}, ${c.min_age}, ${c.max_age}, ${user.id}) returning id`;
      await tx`update campaigns set pool_id = ${poolId} where id = ${c.id}`;
    }
    const [p] = await tx<{ kids_u18: number; status: string }[]>`select kids_u18::float8 as kids_u18, status from v_pool_stats where id = ${poolId}`;
    if (p.kids_u18 < rules.min_beneficiaries)
      throw new HttpError(400, `The coalition covers about ${Math.round(p.kids_u18).toLocaleString()} kids. It needs ${rules.min_beneficiaries.toLocaleString()} before it can go to Treasury: add ZIP codes or pool with another campaign.`);
    if (p.status !== "forming") return { poolId, status: p.status };
    await tx`insert into coalition_confirmations (pool_id, campaign_id, user_id) values (${poolId}, ${c.id}, ${user.id})
             on conflict (pool_id, campaign_id) do nothing`;
    const [{ waiting }] = await tx<{ waiting: number }[]>`
      select count(*)::int as waiting from campaigns x where x.pool_id = ${poolId}
        and not exists (select 1 from coalition_confirmations k where k.pool_id = ${poolId} and k.campaign_id = x.id)`;
    if (waiting === 0) {
      await tx`update pools set status = 'confirmed' where id = ${poolId}`;
      await createDocument(tx as unknown as ReturnType<typeof db>, poolId!);
      return { poolId, status: "confirmed" };
    }
    return { poolId, status: "forming", waiting };
  });
}

/** Freezes the coalition agreement: parties, area, kids, money, terms. */
export async function buildDocument(sql: ReturnType<typeof db>, poolId: string) {
  const rules = await getRules();
  const [p] = await sql<{ name: string; min_age: number; max_age: number; zctas: string[]; kids: number; kids_u18: number; raised: number; all_low_income: boolean }[]>`
    select name, min_age, max_age, zctas, kids_in_class::float8 as kids, kids_u18::float8 as kids_u18, raised_cents::float8 as raised, all_low_income
    from v_pool_stats where id = ${poolId}`;
  const campaigns = await sql<{ id: string; slug: string; name: string; raised: number; donors: number; pledges: number }[]>`
    select s.id, s.slug, s.name, s.raised_cents::float8 as raised, s.donors::int as donors,
           (select count(*)::int from pledges pl where pl.campaign_id = s.id and pl.status in ('pledged', 'pending', 'succeeded')) as pledges
    from v_campaign_stats s where s.pool_id = ${poolId} order by s.created_at`;
  const people = await sql<{ campaign_id: string; name: string; email: string; role: string }[]>`
    select m.campaign_id, u.display_name as name, u.email, m.role
    from campaign_members m join app_users u on u.id = m.user_id join campaigns c on c.id = m.campaign_id
    where c.pool_id = ${poolId} order by m.role = 'owner' desc, m.joined_at`;
  const zips = await sql<{ zcta: string; place: string; kids: number; kids_u18: number; income: number | null }[]>`
    select z.zcta::text as zcta, coalesce(z.place_name || ', ' || z.place_state, '') as place,
           round(child_estimate(a, ${p.min_age}, ${p.max_age}) * citizen_share(a))::float8 as kids, z.kids_u18::float8 as kids_u18,
           z.median_hh_income as income
    from zcta_stats z join acs_zcta_children a on a.zcta = z.zcta and a.acs_year = z.acs_year
    where z.zcta = any(${p.zctas}::char(5)[]) order by z.zcta`;
  const year = new Date().getUTCFullYear();
  const perChild = p.kids > 0 ? Math.floor(p.raised / p.kids) : 0;   // cents, equal for every child
  return {
    title: `Coalition agreement: ${p.name}`,
    prepared: new Date().toISOString().slice(0, 10),
    coalition: { id: poolId, name: p.name },
    parties: campaigns.map((c) => ({
      campaign: c.name, slug: c.slug, pledged_cents: c.raised, donors: c.donors, pledges: c.pledges,
      organizers: people.filter((x) => x.campaign_id === c.id).map((x) => ({ name: x.name, email: x.email, role: x.role })),
    })),
    charity: { name: null as string | null, note: "Only a charity, foundation, donor-advised fund or government can make the contribution to Treasury." },
    qualified_class: {
      zip_codes: zips,
      ages: `${p.min_age}–${p.max_age}`,
      birth_years: `${year - p.max_age}–${year - p.min_age}`,
      est_beneficiaries_in_class: Math.round(p.kids),
      est_beneficiaries_in_area: Math.round(p.kids_u18),
      meets_5000_minimum: p.kids_u18 >= rules.min_beneficiaries,
      all_zips_below_income_line: p.all_low_income,
    },
    money: {
      total_pledged_cents: p.raised,
      equal_amount_per_child_cents: perChild,
      treasury_guidance_per_child_cents: rules.min_per_child_cents,
      meets_guidance: perChild >= rules.min_per_child_cents,
    },
    terms: [
      "Every child in the qualified class receives the same amount, as the Treasury regulations require.",
      "Pledges become donations to the partner charity, which makes one general funding contribution to Treasury for this class.",
      "Gifts keep counting until the money is sent: the contribution is everything the charity has received for this coalition by then. Treasury counts the actual children on the record date, and each child gets an equal share.",
      "Treasury approves each request at its discretion. If it declines, the charity holds the funds and the coalition decides together, through a new agreement, where they go.",
      "Hometown Seed never holds money; it keeps the records shown here.",
    ],
  };
}

async function createDocument(sql: ReturnType<typeof db>, poolId: string) {
  const content = await buildDocument(sql, poolId);
  const hash = crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
  await sql`update coalition_documents set status = 'superseded' where pool_id = ${poolId} and status = 'active'`;
  const [{ v }] = await sql<{ v: number }[]>`select coalesce(max(version), 0) + 1 as v from coalition_documents where pool_id = ${poolId}`;
  await sql`insert into coalition_documents (pool_id, version, content, content_hash) values (${poolId}, ${v}, ${sql.json(content as never)}, ${hash})`;
}

/** Step 3: one organizer approves the agreement for their campaign. */
export async function approveDocument(user: User, documentId: string, campaignSlug: string, signedName: string) {
  const sql = db();
  const name = signedName.trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Type your full name to sign.");
  const [d] = await sql<{ id: string; pool_id: string; status: string }[]>`select id, pool_id, status from coalition_documents where id = ${documentId}`;
  if (!d || d.status !== "active") throw new HttpError(400, "This version of the agreement has been replaced. Open the latest one.");
  const [c] = await sql<{ id: string; pool_id: string | null }[]>`select id, pool_id from campaigns where slug = ${campaignSlug}`;
  if (!c || c.pool_id !== d.pool_id) throw new HttpError(400, "That campaign isn't part of this coalition.");
  await assertOrganizer(c.id, user.id);
  return sql.begin(async (tx) => {
    await tx`insert into document_approvals (document_id, campaign_id, user_id, signed_name) values (${d.id}, ${c.id}, ${user.id}, ${name})
             on conflict (document_id, campaign_id) do nothing`;
    const [{ waiting }] = await tx<{ waiting: number }[]>`
      select count(*)::int as waiting from campaigns x where x.pool_id = ${d.pool_id}
        and not exists (select 1 from document_approvals a where a.document_id = ${d.id} and a.campaign_id = x.id)`;
    if (waiting > 0) return { status: "confirmed", waiting };
    await tx`update pools set status = 'approved' where id = ${d.pool_id}`;
    // Draft the Treasury request for the partner charity
    const [doc] = await tx<{ content: { qualified_class: { zip_codes: { zcta: string }[]; est_beneficiaries_in_class: number }; money: { total_pledged_cents: number; equal_amount_per_child_cents: number } } }[]>`
      select content from coalition_documents where id = ${d.id}`;
    const [ages] = await tx<{ min_age: number; max_age: number }[]>`select min_age, max_age from pools where id = ${d.pool_id}`;
    await tx`delete from treasury_submissions where pool_id = ${d.pool_id} and status = 'draft'`;
    await tx`insert into treasury_submissions (pool_id, zctas, min_age, max_age, est_beneficiaries, amount_cents, per_child_cents, notes)
             values (${d.pool_id}, ${doc.content.qualified_class.zip_codes.map((z) => z.zcta)}::char(5)[], ${ages.min_age}, ${ages.max_age},
                     ${doc.content.qualified_class.est_beneficiaries_in_class}, ${doc.content.money.total_pledged_cents},
                     ${doc.content.money.equal_amount_per_child_cents}, ${"From coalition agreement " + d.id})`;
    return { status: "approved", waiting: 0 };
  });
}

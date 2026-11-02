/**
 * Coalitions: one or more campaigns going to Treasury together.
 *
 * Tracker: 1 Campaign created -> 2 Coalition formed -> 3 Treasury approval -> 4 Money sent.
 * - Step 2: every campaign in the pool confirms "we're ready", and the combined area has
 *   5,000+ kids (the legal minimum). A campaign on its own can be a coalition of one.
 *   The app then freezes a coalition agreement naming every person in the coalition
 *   (organizers and everyone who pledged). Each of them signs it or leaves. Pledges pause
 *   while it's out for signature, so the amount everyone signs is the amount sent.
 *   If anyone leaves, a new version is drawn up and the rest sign again.
 * - Step 3: once everyone has signed, Hometown Seed (a 501(c)(3), the Qualified Donor)
 *   prepares Treasury's application from the agreement.
 */
import crypto from "node:crypto";
import { db } from "./db";
import { HttpError } from "./http";
import { getRules } from "./queries";
import { PLATFORM } from "./platform";
import { sendEmail } from "./email";
import { prepareApplication } from "./treasury";
import type { User } from "./auth";

type Sql = ReturnType<typeof db>;
export type Stage = "created" | "coalition" | "approval" | "send" | "done";
export type Person = { user_id: string; name: string; email: string; organizer_of: string[]; owner_of: string[]; pledged_cents: number };
export type Signer = Person & { signed: boolean; signed_name: string | null; signed_at: string | null };
export type CoalitionState = {
  pool: { id: string; name: string; status: string; kids_u18: number; kids: number; raised: number; meets_min: boolean; zip_count: number } | null;
  campaigns: { id: string; slug: string; name: string; confirmed: boolean }[];
  document: { id: string; version: number; content_hash: string; created_at: string } | null;
  signers: Signer[];
  me: { party: boolean; signed: boolean };
  stage: Stage;
};

/** Statuses after which nobody can join, leave or delete: it has gone to Treasury. */
export const LOCKED = ["submitted", "accepted", "funded", "distributed"];

/** Agreements drawn up before everyone had to sign didn't list people; redraw those that are still open. */
export async function ensureCurrentAgreement(poolId: string) {
  const sql = db();
  const [d] = await sql<{ has_people: boolean }[]>`
    select d.content ? 'people' as has_people from coalition_documents d join pools p on p.id = d.pool_id
    where d.pool_id = ${poolId} and d.status = 'active' and p.status = 'confirmed' order by d.version desc limit 1`;
  if (d && !d.has_people) await sql.begin((tx) => createDocument(tx as unknown as Sql, poolId));
}

export async function coalitionState(campaign: { id: string; pool_id: string | null; meets_min: boolean }, userId?: string | null): Promise<CoalitionState> {
  const sql = db();
  if (!campaign.pool_id) return { pool: null, campaigns: [], document: null, signers: [], me: { party: false, signed: false }, stage: "coalition" };
  await ensureCurrentAgreement(campaign.pool_id);
  const [pool] = await sql<NonNullable<CoalitionState["pool"]>[]>`
    select id, name, status, kids_u18::float8 as kids_u18, kids_in_class::float8 as kids, raised_cents::float8 as raised, meets_min, zip_count
    from v_pool_stats where id = ${campaign.pool_id}`;
  const [doc] = await sql<NonNullable<CoalitionState["document"]>[]>`
    select id, version, content_hash, created_at from coalition_documents where pool_id = ${campaign.pool_id} and status = 'active'
    order by version desc limit 1`;
  const campaigns = await sql<CoalitionState["campaigns"]>`
    select c.id, c.slug, c.name,
           exists (select 1 from coalition_confirmations k where k.pool_id = c.pool_id and k.campaign_id = c.id) as confirmed
    from campaigns c where c.pool_id = ${campaign.pool_id} order by c.created_at`;
  const signers = doc ? await getSigners(sql, doc.id) : [];
  const live = userId ? await sql`select 1 from coalition_people(${campaign.pool_id}) where user_id = ${userId}` : [];
  const mine = signers.find((s) => s.user_id === userId);
  const stage: Stage = ["forming", "confirmed"].includes(pool.status) ? "coalition"
    : ["approved", "submitted", "rejected"].includes(pool.status) ? "approval"
    : ["accepted", "funded"].includes(pool.status) ? "send" : "done";
  return { pool, campaigns, document: doc ?? null, signers, me: { party: !!mine || live.length > 0, signed: !!mine?.signed }, stage };
}

/** The people named in an agreement version, with whether each has signed. */
export async function getSigners(sql: Sql, documentId: string): Promise<Signer[]> {
  const [d] = await sql<{ content: { people?: Person[] } }[]>`select content from coalition_documents where id = ${documentId}`;
  const sigs = await sql<{ user_id: string; signed_name: string; signed_at: string }[]>`
    select user_id, signed_name, signed_at::text from document_signatures where document_id = ${documentId}`;
  const by = new Map(sigs.map((s) => [s.user_id, s]));
  return (d?.content.people ?? []).map((p) => ({ ...p, signed: by.has(p.user_id), signed_name: by.get(p.user_id)?.signed_name ?? null, signed_at: by.get(p.user_id)?.signed_at ?? null }));
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
      await createDocument(tx as unknown as Sql, poolId!);
      return { poolId, status: "confirmed", newAgreement: true };
    }
    return { poolId, status: "forming", waiting };
  });
}

/** Freezes the coalition agreement: everyone in it, the area, kids, money, terms. */
export async function buildDocument(sql: Sql, poolId: string) {
  const rules = await getRules();
  const [p] = await sql<{ name: string; min_age: number; max_age: number; zctas: string[]; kids: number; kids_u18: number; raised: number; all_low_income: boolean }[]>`
    select name, min_age, max_age, zctas, kids_in_class::float8 as kids, kids_u18::float8 as kids_u18, raised_cents::float8 as raised, all_low_income
    from v_pool_stats where id = ${poolId}`;
  const campaigns = await sql<{ id: string; slug: string; name: string; raised: number; donors: number; pledges: number }[]>`
    select s.id, s.slug, s.name, s.raised_cents::float8 as raised, s.donors::int as donors,
           (select count(*)::int from pledges pl where pl.campaign_id = s.id and pl.status in ('pledged', 'pending', 'succeeded')) as pledges
    from v_campaign_stats s where s.pool_id = ${poolId} order by s.created_at`;
  const org = await sql<{ campaign_id: string; name: string; email: string; role: string }[]>`
    select m.campaign_id, u.display_name as name, u.email, m.role
    from campaign_members m join app_users u on u.id = m.user_id join campaigns c on c.id = m.campaign_id
    where c.pool_id = ${poolId} order by m.role = 'owner' desc, m.joined_at`;
  const people = await sql<Person[]>`
    select user_id, name, email, organizer_of, owner_of, pledged_cents::float8 as pledged_cents from coalition_people(${poolId})`;
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
      organizers: org.filter((x) => x.campaign_id === c.id).map((x) => ({ name: x.name, email: x.email, role: x.role })),
    })),
    people,   // everyone who must sign
    charity: {
      name: PLATFORM.entity_name, ein: PLATFORM.ein, type: "501(c)(3) public charity",
      note: "Hometown Seed's nonprofit receives the coalition's gifts and makes one general funding contribution to Treasury as the Qualified Donor.",
    },
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
      "Everyone named in section 5 signs this agreement, or leaves the coalition. It takes effect when all of them have signed.",
      "Every child in the qualified class receives the same amount, as the Treasury regulations require.",
      `Pledges become tax-deductible donations to ${PLATFORM.entity_name}, a 501(c)(3), which applies to Treasury as the Qualified Donor and makes one general funding contribution for this class.`,
      "The contribution is the total in section 3. New pledges are paused while this agreement is out for signature and with Treasury.",
      "Anyone may leave before the application is sent to Treasury. Leaving withdraws that person's pledges (and takes out any campaign they own); a new version of this agreement is then drawn up and the others sign again.",
      "Treasury approves each request at its discretion. If it declines, the funds stay with the charity and the coalition decides together, through a new agreement, where they go.",
    ],
  };
}

async function createDocument(sql: Sql, poolId: string) {
  const content = await buildDocument(sql, poolId);
  const hash = crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
  await sql`update coalition_documents set status = 'superseded' where pool_id = ${poolId} and status = 'active'`;
  const [{ v }] = await sql<{ v: number }[]>`select coalesce(max(version), 0) + 1 as v from coalition_documents where pool_id = ${poolId}`;
  await sql`insert into coalition_documents (pool_id, version, content, content_hash) values (${poolId}, ${v}, ${sql.json(content as never)}, ${hash})`;
}

/** One person signs the agreement. When the last one signs, the Treasury application is prepared. */
export async function signDocument(user: User, documentId: string, signedName: string) {
  const sql = db();
  const name = signedName.trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Type your full name to sign.");
  const [d] = await sql<{ id: string; pool_id: string; status: string }[]>`select id, pool_id, status from coalition_documents where id = ${documentId}`;
  if (!d || d.status !== "active") throw new HttpError(400, "This version of the agreement has been replaced. Open the latest one.");
  const [p] = await sql<{ status: string }[]>`select status from pools where id = ${d.pool_id}`;
  if (p.status !== "confirmed") throw new HttpError(400, "This agreement isn't open for signatures.");
  const signers = await getSigners(sql, d.id);
  if (!signers.some((s) => s.user_id === user.id)) throw new HttpError(403, "You're not named in this agreement.");
  return sql.begin(async (tx) => {
    await tx`insert into document_signatures (document_id, user_id, signed_name) values (${d.id}, ${user.id}, ${name})
             on conflict (document_id, user_id) do nothing`;
    const all = await getSigners(tx as unknown as Sql, d.id);
    // someone who deleted their account no longer counts
    const exists = new Set((await tx<{ id: string }[]>`select id from app_users where id = any(${all.map((s) => s.user_id)}::uuid[])`).map((r) => r.id));
    const waiting = all.filter((s) => !s.signed && exists.has(s.user_id)).length;
    if (waiting > 0) return { status: "confirmed", waiting };
    await tx`update pools set status = 'approved' where id = ${d.pool_id}`;
    await prepareApplication(tx as unknown as Sql, d.pool_id);
    return { status: "approved", waiting: 0 };
  });
}

/**
 * After someone leaves or a campaign is removed or deleted. An agreement that was out
 * for signature (or signed, or turned down) is redrawn for whoever is left, if the area
 * still has enough kids; otherwise the coalition goes back to forming.
 */
async function afterMembershipChange(tx: Sql, poolId: string, prior: string): Promise<{ status: string; newAgreement?: boolean }> {
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from campaigns where pool_id = ${poolId}`;
  await tx`select reset_coalition(${poolId})`;
  if (n === 0) {
    const [{ subs }] = await tx<{ subs: number }[]>`select count(*)::int as subs from treasury_submissions where pool_id = ${poolId}`;
    if (!subs) await tx`delete from pools where id = ${poolId}`;
    return { status: "dissolved" };
  }
  if (!["confirmed", "approved", "rejected"].includes(prior)) return { status: "forming" };
  const rules = await getRules();
  const [p] = await tx<{ kids_u18: number }[]>`select kids_u18::float8 as kids_u18 from v_pool_stats where id = ${poolId}`;
  if (p.kids_u18 < rules.min_beneficiaries) return { status: "forming" };
  await tx`insert into coalition_confirmations (pool_id, campaign_id) select ${poolId}, id from campaigns where pool_id = ${poolId}
           on conflict (pool_id, campaign_id) do nothing`;
  await tx`update pools set status = 'confirmed' where id = ${poolId}`;
  await createDocument(tx, poolId);
  return { status: "confirmed", newAgreement: true };
}

/** After an account is deleted: redraw the agreements it was part of. */
export async function redrawAfterDeparture(pools: { id: string; status: string }[]) {
  for (const p of pools) await db().begin((t) => afterMembershipChange(t as unknown as Sql, p.id, p.status));
}

async function lockedPool(sql: Sql, poolId: string) {
  const [p] = await sql<{ status: string }[]>`select status from pools where id = ${poolId} for update`;
  if (!p) throw new HttpError(404, "Coalition not found.");
  if (LOCKED.includes(p.status)) throw new HttpError(400, "This coalition's application has already gone to Treasury, so its members are fixed.");
  return p.status;
}

/** A person leaves: their pledges are withdrawn, co-organizer roles dropped, and campaigns they own leave with them. */
export async function leaveCoalition(user: User, poolId: string) {
  const sql = db();
  const [party] = await sql`select 1 from coalition_people(${poolId}) where user_id = ${user.id}`;
  if (!party) throw new HttpError(403, "You're not part of this coalition.");
  return sql.begin(async (t) => {
    const tx = t as unknown as Sql;
    const prior = await lockedPool(tx, poolId);
    const owned = await tx<{ id: string; name: string }[]>`
      select c.id, c.name from campaigns c join campaign_members m on m.campaign_id = c.id
      where c.pool_id = ${poolId} and m.user_id = ${user.id} and m.role = 'owner'`;
    const ownedIds = owned.map((o) => o.id);
    await tx`update pledges set status = 'cancelled', updated_at = now()
             where user_id = ${user.id} and status in ('pledged', 'pending')
               and campaign_id in (select id from campaigns where pool_id = ${poolId} and not (id = any(${ownedIds}::uuid[])))`;
    await tx`delete from campaign_members where user_id = ${user.id} and role <> 'owner'
               and campaign_id in (select id from campaigns where pool_id = ${poolId})`;
    if (ownedIds.length) await tx`update campaigns set pool_id = null, updated_at = now() where id = any(${ownedIds}::uuid[])`;
    const r = await afterMembershipChange(tx, poolId, prior);
    return { ...r, removedCampaigns: owned.map((o) => o.name) };
  });
}

/** An organizer takes their campaign (with its organizers and donors) out of the coalition. */
export async function removeCampaign(user: User, slug: string) {
  const sql = db();
  const [c] = await sql<{ id: string; pool_id: string | null }[]>`select id, pool_id from campaigns where slug = ${slug}`;
  if (!c) throw new HttpError(404, "Campaign not found.");
  await assertOrganizer(c.id, user.id);
  if (!c.pool_id) throw new HttpError(400, "This campaign isn't in a coalition.");
  const poolId = c.pool_id;
  return sql.begin(async (t) => {
    const tx = t as unknown as Sql;
    const prior = await lockedPool(tx, poolId);
    await tx`update campaigns set pool_id = null, updated_at = now() where id = ${c.id}`;
    return { poolId, ...(await afterMembershipChange(tx, poolId, prior)) };
  });
}

/** The owner deletes a campaign that hasn't gone to Treasury. Its pledges (promises only) go with it. */
export async function deleteCampaign(user: User, slug: string) {
  const sql = db();
  const [c] = await sql<{ id: string; pool_id: string | null }[]>`select id, pool_id from campaigns where slug = ${slug}`;
  if (!c) throw new HttpError(404, "Campaign not found.");
  const [m] = await sql`select 1 from campaign_members where campaign_id = ${c.id} and user_id = ${user.id} and role = 'owner'`;
  if (!m) throw new HttpError(403, "Only the person who started this campaign can delete it.");
  return sql.begin(async (t) => {
    const tx = t as unknown as Sql;
    const prior = c.pool_id ? await lockedPool(tx, c.pool_id) : null;
    await tx`select delete_campaign(${c.id})`;
    return c.pool_id ? { poolId: c.pool_id, ...(await afterMembershipChange(tx, c.pool_id, prior!)) } : { status: "deleted" };
  });
}

/** Emails everyone named in the current agreement that it's ready to sign (dev: printed to the terminal). */
export async function notifySigners(poolId: string, base: string) {
  const sql = db();
  const [d] = await sql<{ id: string; version: number; name: string }[]>`
    select d.id, d.version, p.name from coalition_documents d join pools p on p.id = d.pool_id
    where d.pool_id = ${poolId} and d.status = 'active' order by d.version desc limit 1`;
  if (!d) return;
  const link = `${base}/coalitions/${poolId}`;
  for (const s of await getSigners(sql, d.id)) {
    if (s.signed) continue;
    await sendEmail({
      to: s.email, link,
      subject: `Sign or leave: coalition agreement for ${d.name}${d.version > 1 ? ` (version ${d.version})` : ""}`,
      text: `Hi ${s.name},\n\nThe coalition agreement for ${d.name} is ready. Everyone in the coalition needs to sign it, or leave, before it goes to Treasury:\n${link}`,
      html: `<p>Hi ${s.name.replace(/[<>&]/g, "")},</p><p>The coalition agreement for <b>${d.name.replace(/[<>&]/g, "")}</b> is ready. Everyone in the coalition needs to sign it, or leave, before it goes to Treasury.</p><p><a href="${link}">Review and sign</a></p>`,
    }).catch((e) => console.warn("[coalition] could not email", s.email, (e as Error).message));
  }
}

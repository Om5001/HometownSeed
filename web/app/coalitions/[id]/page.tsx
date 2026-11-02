import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCurrentAgreement, getSigners, LOCKED, type buildDocument, type Person } from "@/lib/coalition";
import { fmt, money, moneyC, perChild } from "@/lib/format";
import { LeaveCoalition, PrintButton, SignForm } from "@/components/CoalitionActions";
import { TreasuryPanel } from "@/components/TreasuryPanel";
import { getOutbox, getSubmission, mockTreasuryEnabled, roleLabel } from "@/lib/treasury";
import { platformPlaceholders } from "@/lib/platform";

export const dynamic = "force-dynamic";
type Doc = Awaited<ReturnType<typeof buildDocument>>;

export default async function CoalitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePageUser(`/coalitions/${id}`);
  const sql = db();
  const [pool] = await sql<{ id: string; name: string; status: string }[]>`select id, name, status from pools where id = ${id}`;
  if (!pool) notFound();
  await ensureCurrentAgreement(id);
  const live = await sql<Person[]>`select user_id, name, email, organizer_of, owner_of, pledged_cents::float8 as pledged_cents from coalition_people(${id})`;
  const [doc] = await sql<{ id: string; version: number; content: Doc; content_hash: string; created_at: string; status: string }[]>`
    select id, version, content, content_hash, created_at, status from coalition_documents where pool_id = ${id}
    order by (status = 'active') desc, version desc limit 1`;
  const signers = doc ? await getSigners(sql, doc.id) : [];
  const meLive = live.find((p) => p.user_id === user.id);
  const meSigner = signers.find((s) => s.user_id === user.id);
  if (!meLive && !meSigner) return (
    <main className="wrap section"><h2>This agreement is private</h2><p className="lede2">Only the organizers and donors in this coalition can see it.</p></main>
  );
  const [firstCampaign] = await sql<{ slug: string; name: string }[]>`
    select c.slug, c.name from campaigns c
    where c.pool_id = ${id} and (exists (select 1 from campaign_members m where m.campaign_id = c.id and m.user_id = ${user.id})
                                 or exists (select 1 from pledges p where p.campaign_id = c.id and p.user_id = ${user.id}))
    order by c.created_at limit 1`;
  const back = firstCampaign ? { href: `/c/${firstCampaign.slug}`, name: firstCampaign.name } : { href: "/me", name: "your campaigns" };
  const statusText: Record<string, string> = {
    forming: "Forming: waiting for every campaign to confirm", confirmed: "Out for signature: everyone signs or leaves",
    approved: "Signed by everyone: ready to send to Treasury", submitted: "Application sent to Treasury",
    rejected: "Treasury didn't approve the application", accepted: "Approved by Treasury: ready to send the money",
    funded: "Money sent to Treasury", distributed: "Distributed to children's accounts",
  };
  const canLeave = !!meLive && !LOCKED.includes(pool.status);
  const consequences = meLive ? [
    ...(meLive.owner_of.length ? [`Your campaign${meLive.owner_of.length > 1 ? "s" : ""} (${meLive.owner_of.join(", ")}) leave${meLive.owner_of.length > 1 ? "" : "s"} the coalition, with ${meLive.owner_of.length > 1 ? "their" : "its"} co-organizers and donors. You keep running ${meLive.owner_of.length > 1 ? "them" : "it"} on your own.`] : []),
    ...(meLive.organizer_of.filter((x) => !meLive.owner_of.includes(x)).length ? [`You stop co-organizing ${meLive.organizer_of.filter((x) => !meLive.owner_of.includes(x)).join(", ")}.`] : []),
    ...(meLive.pledged_cents > 0 ? [`Your pledges to other campaigns in this coalition are withdrawn.`] : []),
    "Everyone left gets a new version of the agreement to sign. If the area drops below 5,000 kids, the coalition goes back to forming.",
  ] : [];

  if (!doc || doc.status !== "active") return (
    <main className="wrap section">
      <h2>{pool.name}</h2>
      <p className="lede2">{statusText[pool.status]}. The agreement is drawn up once every campaign in the coalition has confirmed it&apos;s ready; then everyone in it signs.</p>
      <h3 style={{ marginTop: 18 }}>Who&apos;s in it so far</h3>
      <ul className="small">{live.map((p) => <li key={p.user_id}>{p.name} <span className="muted">· {roleLabel(p)}</span></li>)}</ul>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Link className="btn btn-ghost btn-sm" href={back.href}>Back to {back.name}</Link>
        {canLeave && <LeaveCoalition poolId={id} consequences={consequences} backTo={back.href} />}
      </div>
    </main>
  );

  const d = doc.content;
  const signedN = signers.filter((s) => s.signed).length;
  const treasuryStage = ["approved", "submitted", "rejected", "accepted", "funded", "distributed"].includes(pool.status);
  const [sub, messages] = treasuryStage ? await Promise.all([getSubmission(id), getOutbox(id)]) : [null, []];
  return (
    <main className="wrap" style={{ paddingBlock: 28 }}>
      <div className="noprint split" style={{ maxWidth: 860, margin: "0 auto 14px" }}>
        <Link className="back" href={back.href}>← Back to {back.name}</Link>
        <PrintButton />
      </div>

      {pool.status === "confirmed" && meSigner && (
        <section className="panel noprint" style={{ maxWidth: 860, margin: "0 auto 18px" }}>
          {meSigner.signed ? (<>
            <h2>You signed</h2>
            <p className="hint" style={{ marginTop: 6 }}>{signedN} of {signers.length} people have signed. When everyone has, Hometown Seed prepares the Treasury application.</p>
          </>) : (<>
            <h2>Sign or leave</h2>
            <p className="hint" style={{ marginTop: 6 }}>Everyone in the coalition, organizers and donors, signs this agreement or leaves it. Signing approves this exact version (fingerprint at the bottom). {signedN} of {signers.length} have signed.</p>
            <SignForm poolId={id} documentId={doc.id} defaultName={user.display_name} />
          </>)}
          {canLeave && <div className="leave-box"><LeaveCoalition poolId={id} consequences={consequences} backTo={back.href} /></div>}
        </section>
      )}

      <article className="doc">
        <p className="eyebrow">Coalition agreement · version {doc.version}</p>
        <h1 style={{ marginTop: 6 }}>{d.coalition.name}</h1>
        <p className="meta">Prepared {d.prepared} · Status: {statusText[pool.status]}</p>

        <h2>1. Parties</h2>
        <p style={{ fontSize: 14 }}><b>{d.charity.name}</b>{"ein" in d.charity ? ` (${d.charity.type ?? "501(c)(3)"}, EIN ${d.charity.ein})` : ""}. {d.charity.note}</p>
        <table style={{ marginTop: 8 }}><thead><tr><th>Campaign</th><th>Organizers</th><th className="n">Pledged</th><th className="n">Donors</th></tr></thead>
          <tbody>{d.parties.map((p) => (
            <tr key={p.slug}><td><b>{p.campaign}</b></td>
              <td>{p.organizers.map((o) => <div key={o.email}>{o.name} <span className="meta">({o.role})</span></div>)}</td>
              <td className="n">{money(p.pledged_cents)}</td><td className="n">{fmt(p.donors)}</td></tr>
          ))}</tbody></table>
        <p className="meta" style={{ marginTop: 8 }}>Everyone in these campaigns, listed in section 5, signs this agreement.</p>

        <h2>2. Who receives the money (qualified class)</h2>
        <p style={{ fontSize: 14 }}>Children in their Trump Account growth period, ages {d.qualified_class.ages} (born about {d.qualified_class.birth_years}; Treasury sets the exact birth years and record date), living in {d.qualified_class.zip_codes.length === 1 ? "this ZIP code area" : `these ${d.qualified_class.zip_codes.length} ZIP code areas`}.
          Estimated <b>{fmt(d.qualified_class.est_beneficiaries_in_class)}</b> children in the class; {fmt(d.qualified_class.est_beneficiaries_in_area)} account holders in the area{d.qualified_class.meets_5000_minimum ? ", above the 5,000 required." : ", below the 5,000 required."}</p>
        <table style={{ marginTop: 8 }}><thead><tr><th>ZIP</th><th>Place</th><th className="n">Kids in class</th><th className="n">Median income</th></tr></thead>
          <tbody>{d.qualified_class.zip_codes.map((z) => (
            <tr key={z.zcta}><td className="num">{z.zcta}</td><td>{z.place}</td><td className="n">{fmt(z.kids)}</td><td className="n">{z.income ? moneyC(z.income * 100) : "—"}</td></tr>
          ))}</tbody></table>

        <h2>3. Money</h2>
        <table><tbody>
          <tr><td>Contribution (total pledged)</td><td className="n"><b>{money(d.money.total_pledged_cents)}</b></td></tr>
          <tr><td>Equal amount per child (estimate)</td><td className="n"><b>{perChild(d.money.equal_amount_per_child_cents)}</b></td></tr>
          <tr><td>Treasury guidance for 2026–2027 applications</td><td className="n">{perChild(d.money.treasury_guidance_per_child_cents)} per child {d.money.meets_guidance ? "✓" : "(not yet met)"}</td></tr>
        </tbody></table>

        <h2>4. Terms</h2>
        <ol>{d.terms.map((t) => <li key={t}>{t}</li>)}</ol>

        <h2>5. Signatures</h2>
        {signers.length ? (
          <table className="signers"><thead><tr><th>Name</th><th>Role</th><th className="n">Pledged</th><th>Signature</th></tr></thead>
            <tbody>{signers.map((s) => (
              <tr key={s.user_id}><td><b>{s.name}</b>{s.user_id === user.id && <span className="meta"> (you)</span>}</td><td className="meta">{roleLabel(s)}</td>
                <td className="n">{s.pledged_cents ? money(s.pledged_cents) : "—"}</td>
                <td className="st">{s.signed ? <>/s/ {s.signed_name}<div className="meta">{new Date(s.signed_at!).toLocaleString("en-US")}</div></> : <span className="meta">Waiting</span>}</td></tr>
            ))}</tbody></table>
        ) : <p className="meta">No one is named yet.</p>}
        <p className="hash" style={{ marginTop: 18 }}>Document fingerprint (SHA-256): {doc.content_hash}</p>
      </article>

      {treasuryStage && (
        <TreasuryPanel poolId={id} status={pool.status} sub={sub} messages={messages} mock={mockTreasuryEnabled()} placeholders={platformPlaceholders()} />
      )}
      {treasuryStage && canLeave && (
        <section className="panel noprint" style={{ maxWidth: 860, margin: "18px auto 0" }}>
          <p className="hint">Changed your mind before it&apos;s sent? Anyone can still leave; the others then sign a new version.</p>
          <div style={{ marginTop: 10 }}><LeaveCoalition poolId={id} consequences={consequences} backTo={back.href} /></div>
        </section>
      )}
    </main>
  );
}

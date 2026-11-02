import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { buildDocument } from "@/lib/coalition";
import { fmt, money, moneyC, perChild } from "@/lib/format";
import { ApproveForm, PrintButton } from "@/components/CoalitionActions";
import { TreasuryPanel } from "@/components/TreasuryPanel";
import { getOutbox, getSubmission, mockTreasuryEnabled } from "@/lib/treasury";

export const dynamic = "force-dynamic";
type Doc = Awaited<ReturnType<typeof buildDocument>>;

export default async function CoalitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePageUser(`/coalitions/${id}`);
  const sql = db();
  const [pool] = await sql<{ id: string; name: string; status: string }[]>`select id, name, status from pools where id = ${id}`;
  if (!pool) notFound();
  const mine = await sql<{ slug: string; name: string }[]>`
    select c.slug, c.name from campaigns c join campaign_members m on m.campaign_id = c.id
    where c.pool_id = ${id} and m.user_id = ${user.id} order by c.created_at`;
  if (!mine.length) return (
    <main className="wrap section"><h2>This agreement is private</h2><p className="lede2">Only organizers of campaigns in this coalition can see it.</p></main>
  );
  const [doc] = await sql<{ id: string; version: number; content: Doc; content_hash: string; created_at: string; status: string }[]>`
    select id, version, content, content_hash, created_at, status from coalition_documents where pool_id = ${id}
    order by (status = 'active') desc, version desc limit 1`;
  const approvals = doc ? await sql<{ campaign: string; slug: string; signed_name: string; approved_at: string }[]>`
    select c.name as campaign, c.slug, a.signed_name, a.approved_at from document_approvals a join campaigns c on c.id = a.campaign_id
    where a.document_id = ${doc.id} order by a.approved_at` : [];
  const signed = new Set(approvals.map((a) => a.slug));
  const toSign = mine.filter((m) => !signed.has(m.slug));
  const statusText: Record<string, string> = {
    forming: "Forming: waiting for every campaign to confirm", confirmed: "Waiting for signatures",
    approved: "Signed by every campaign: ready for the Treasury application", submitted: "Application sent to Treasury",
    rejected: "Treasury didn't approve the application", accepted: "Approved by Treasury: ready to send the money",
    funded: "Money sent to Treasury", distributed: "Distributed to children's accounts",
  };

  if (!doc || doc.status !== "active") return (
    <main className="wrap section">
      <h2>{pool.name}</h2>
      <p className="lede2">{statusText[pool.status]}. The agreement is drawn up once every campaign in the coalition has confirmed it&apos;s ready.</p>
      <p style={{ marginTop: 14 }}>{mine.map((m) => <Link key={m.slug} className="btn btn-ghost btn-sm" href={`/c/${m.slug}`}>Back to {m.name}</Link>)}</p>
    </main>
  );

  const d = doc.content;
  const treasuryStage = ["approved", "submitted", "rejected", "accepted", "funded", "distributed"].includes(pool.status);
  const [sub, messages, [pledged]] = treasuryStage
    ? await Promise.all([getSubmission(id), getOutbox(id), sql<{ raised: number }[]>`select raised_cents::float8 as raised from v_pool_stats where id = ${id}`])
    : [null, [], [{ raised: 0 }]];
  return (
    <main className="wrap" style={{ paddingBlock: 28 }}>
      <div className="noprint split" style={{ maxWidth: 860, margin: "0 auto 14px" }}>
        <Link className="back" href={`/c/${mine[0].slug}`}>← Back to {mine[0].name}</Link>
        <PrintButton />
      </div>
      <article className="doc">
        <p className="eyebrow">Coalition agreement · version {doc.version}</p>
        <h1 style={{ marginTop: 6 }}>{d.coalition.name}</h1>
        <p className="meta">Prepared {d.prepared} · Status: {statusText[pool.status]}</p>

        <h2>1. Parties</h2>
        <table><thead><tr><th>Campaign</th><th>Organizers</th><th className="n">Pledged</th><th className="n">Donors</th></tr></thead>
          <tbody>{d.parties.map((p) => (
            <tr key={p.slug}><td><b>{p.campaign}</b></td>
              <td>{p.organizers.map((o) => <div key={o.email}>{o.name} <span className="meta">({o.role}) {o.email}</span></div>)}</td>
              <td className="n">{money(p.pledged_cents)}</td><td className="n">{fmt(p.donors)}</td></tr>
          ))}</tbody></table>
        <p className="meta" style={{ marginTop: 8 }}>Partner charity: {d.charity.name ?? "to be named"}. {d.charity.note}</p>

        <h2>2. Who receives the money (qualified class)</h2>
        <p style={{ fontSize: 14 }}>Children in their Trump Account growth period, ages {d.qualified_class.ages} (born about {d.qualified_class.birth_years}; Treasury sets the exact birth years and record date), living in {d.qualified_class.zip_codes.length === 1 ? "this ZIP code area" : `these ${d.qualified_class.zip_codes.length} ZIP code areas`}.
          Estimated <b>{fmt(d.qualified_class.est_beneficiaries_in_class)}</b> children in the class; {fmt(d.qualified_class.est_beneficiaries_in_area)} account holders in the area{d.qualified_class.meets_5000_minimum ? ", above the 5,000 required." : ", below the 5,000 required."}</p>
        <table style={{ marginTop: 8 }}><thead><tr><th>ZIP</th><th>Place</th><th className="n">Kids in class</th><th className="n">Median income</th></tr></thead>
          <tbody>{d.qualified_class.zip_codes.map((z) => (
            <tr key={z.zcta}><td className="num">{z.zcta}</td><td>{z.place}</td><td className="n">{fmt(z.kids)}</td><td className="n">{z.income ? moneyC(z.income * 100) : "—"}</td></tr>
          ))}</tbody></table>

        <h2>3. Money</h2>
        <table><tbody>
          <tr><td>Pledged so far</td><td className="n"><b>{money(d.money.total_pledged_cents)}</b></td></tr>
          <tr><td>Equal amount per child so far (estimate)</td><td className="n"><b>{perChild(d.money.equal_amount_per_child_cents)}</b></td></tr>
          <tr><td>Treasury guidance for 2026–2027 applications</td><td className="n">{perChild(d.money.treasury_guidance_per_child_cents)} per child {d.money.meets_guidance ? "✓" : "(not yet met)"}</td></tr>
        </tbody></table>

        <h2>4. Terms</h2>
        <ol>{d.terms.map((t) => <li key={t}>{t}</li>)}</ol>

        <h2>5. Approvals</h2>
        {approvals.length ? (
          <table><thead><tr><th>Campaign</th><th>Signed by</th><th>When</th></tr></thead>
            <tbody>{approvals.map((a) => <tr key={a.slug}><td>{a.campaign}</td><td>{a.signed_name}</td><td>{new Date(a.approved_at).toLocaleString("en-US")}</td></tr>)}</tbody></table>
        ) : <p className="meta">No signatures yet.</p>}
        <p className="hash" style={{ marginTop: 18 }}>Document fingerprint (SHA-256): {doc.content_hash}</p>
      </article>

      {treasuryStage && (
        <TreasuryPanel poolId={id} status={pool.status} sub={sub} messages={messages} mock={mockTreasuryEnabled()}
          defaults={{ amount_cents: pledged.raised, recognition_name: d.coalition.name, rep_name: user.display_name, rep_email: user.email }} />
      )}
      {toSign.length > 0 && pool.status === "confirmed" && (
        <section className="panel noprint" style={{ maxWidth: 860, margin: "18px auto 0" }}>
          <h2>Sign for your campaign</h2>
          <p className="hint" style={{ marginTop: 6 }}>Signing approves this exact version (fingerprint above). If anyone joins or leaves the coalition, a new version is drawn up and everyone signs again.</p>
          {toSign.map((m) => <ApproveForm key={m.slug} poolId={id} documentId={doc.id} campaign={m} defaultName={user.display_name} />)}
        </section>
      )}
    </main>
  );
}

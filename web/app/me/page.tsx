import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listCampaigns } from "@/lib/queries";
import { CampaignCard } from "@/components/CampaignCard";

export const dynamic = "force-dynamic";

export default async function Me({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await requirePageUser("/me");
  const { deleted } = await searchParams;
  const sql = db();
  // Campaigns they organize, and coalitions they're in (as organizer or donor) and whether their signature is needed
  const [mine, coalitions] = await Promise.all([listCampaigns({ member: user.id, limit: 60 }), sql<{ id: string; name: string; status: string; needs_sig: boolean }[]>`
    select p.id, p.name, p.status,
           (p.status = 'confirmed' and d.content -> 'people' @> jsonb_build_array(jsonb_build_object('user_id', ${user.id}::text))
            and not exists (select 1 from document_signatures s where s.document_id = d.id and s.user_id = ${user.id})) as needs_sig
    from pools p
    left join coalition_documents d on d.pool_id = p.id and d.status = 'active'
    where p.id in (select c.pool_id from campaigns c where c.pool_id is not null and (
        exists (select 1 from campaign_members m where m.campaign_id = c.id and m.user_id = ${user.id})
        or exists (select 1 from pledges pl where pl.campaign_id = c.id and pl.user_id = ${user.id} and pl.status in ('pledged', 'pending', 'succeeded'))))
    order by needs_sig desc, p.created_at desc`]);
  const label: Record<string, string> = { forming: "Forming", confirmed: "Out for signature", approved: "Signed: ready for Treasury", submitted: "With Treasury",
    rejected: "Not approved by Treasury", accepted: "Approved by Treasury", funded: "Money sent", distributed: "In kids' accounts" };
  return (
    <main className="wrap section">
      {deleted && <p className="notice" style={{ marginBottom: 16 }}><b>Campaign deleted.</b></p>}
      {coalitions.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-head"><div><h2>Your coalitions</h2><p className="muted">Everyone in a coalition signs its agreement, or leaves.</p></div></div>
          <div className="mcards">{coalitions.map((k) => (
            <div className="mcard" key={k.id}><div className="top-line"><Link href={`/coalitions/${k.id}`}><b>{k.name}</b></Link><span className="small muted">{label[k.status] ?? k.status}</span></div>
              {k.needs_sig && <Link className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} href={`/coalitions/${k.id}`}>Your signature is needed: sign or leave</Link>}</div>
          ))}</div>
        </div>
      )}
      <div className="section-head"><div><h2>Your campaigns</h2><p className="muted">Campaigns you started or help organize.</p></div><Link className="btn btn-green" href="/start">Start a campaign</Link></div>
      <div className="cards">{mine.length ? mine.map((c) => <CampaignCard key={c.id} c={c} />) : <p className="empty">You aren&apos;t organizing any campaigns yet.</p>}</div>
    </main>
  );
}

import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getConnections } from "@/lib/queries";
import { ago, initials, perChild } from "@/lib/format";
import { CampaignCard } from "@/components/CampaignCard";
import { InviteToCampaign, JoinInvite } from "@/components/ConnectionActions";
import { MessageButton } from "@/components/Messaging";

export const dynamic = "force-dynamic";
const GIFT: Record<string, string> = { cash: "Cash", stock: "Stock", daf: "DAF" };

export default async function ConnectionsPage() {
  const user = await requirePageUser("/connections");
  const [{ people, liked, invites }, mine] = await Promise.all([
    getConnections(user.id),
    db()<{ slug: string; name: string }[]>`
      select c.slug, c.name from campaign_members m join campaigns c on c.id = m.campaign_id
      where m.user_id = ${user.id} and c.status = 'active' order by c.created_at desc`,
  ]);
  return (
    <main className="wrap section">
      <div className="section-head"><div><h2>Saved and invites</h2><p className="muted">People and campaigns you saved, and invites waiting for you. Message anyone here; email addresses are shared only when you&apos;ve both saved each other.</p></div>
        <Link className="btn btn-green" href="/match">Find more partners</Link></div>
      <div className="grid">
        <div className="col">
          <section className="panel">
            <div className="panel-head"><h2>People you saved</h2><span className="eyebrow">{people.length}</span></div>
            {people.length ? people.map((p) => (
              <div className="person-row" key={p.id}>
                <span className="avatar av-friend">{initials(p.display_name)}</span>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="split"><b>{p.display_name}{p.mutual && <span className="tag g" style={{ marginLeft: 6 }}>Saved you too</span>}</b><span className="small muted">saved {ago(p.matched_at).toLowerCase()}</span></div>
                  <p className="small muted">{p.home ?? "Giving nationwide"}{p.per_child_cents ? ` · ${perChild(p.per_child_cents)} per child` : ""}{p.email ? <> · <a href={`mailto:${p.email}`}>{p.email}</a></> : null}</p>
                  {p.bio && <p className="small">{p.bio}</p>}
                  <div className="tags">{(p.gift_types ?? []).map((g) => <span key={g} className="tag">{GIFT[g] ?? g}</span>)}{(p.target_zips ?? []).slice(0, 4).map((z) => <span key={z} className="tag b">{z}</span>)}</div>
                  <div className="acts" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <MessageButton to={p.id} name={p.display_name} className="btn btn-green btn-sm" />
                    <Link className="btn btn-ghost btn-sm" href={`/start?with=${p.id}`}>Start a campaign together</Link>
                    {p.email && <InviteToCampaign email={p.email} name={p.display_name} campaigns={mine} />}
                  </div>
                </div>
              </div>
            )) : <p className="empty">Nobody saved yet. Save people from <Link href="/match">Find partners</Link>.</p>}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Campaigns you saved</h2><span className="eyebrow">{liked.length}</span></div>
            {liked.length ? <div className="cards" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>{liked.map((c) => <CampaignCard key={c.id} c={c} />)}</div>
              : <p className="empty">Save a campaign from Find partners to keep it here.</p>}
          </section>
        </div>
        <div className="col">
          <section className="panel">
            <div className="panel-head"><h2>Invites for you</h2></div>
            {invites.length ? invites.map((i) => (
              <div className="mcard" key={i.id} style={{ marginBottom: 10 }}>
                <div className="top-line"><Link href={`/c/${i.slug}`}>{i.name}</Link></div>
                <p className="small muted">{i.from_name} invited you to co-organize.</p>
                <JoinInvite code={i.invite_code} />
              </div>
            )) : <p className="empty">No invites right now.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}

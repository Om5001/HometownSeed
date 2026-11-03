import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDeck, getProfile } from "@/lib/queries";
import { PartnerList } from "@/components/PartnerList";

export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const user = await requirePageUser("/match");
  const [profile, deck, mine] = await Promise.all([
    getProfile(user.id), getDeck(user.id, 60),
    db()<{ slug: string; name: string }[]>`
      select c.slug, c.name from campaign_members m join campaigns c on c.id = m.campaign_id
      where m.user_id = ${user.id} and c.status = 'active' and c.open_to_matching order by c.created_at desc`,
  ]);
  return (
    <main className="wrap section">
      <div className="section-head"><div>
        <p className="eyebrow">Find partners</p>
        <h2 style={{ marginTop: 6 }}>People and campaigns giving where you are</h2>
        <p className="muted" style={{ maxWidth: "70ch" }}>Ranked by how close their places are to yours and how similar their amount per child is. Message anyone directly, ask a campaign to pool, or save them for later. Prefer one at a time? Switch to Quick review.</p>
      </div><Link className="btn btn-ghost" href="/connections">Saved and invites</Link></div>
      {!profile && <p className="notice" style={{ marginBottom: 14 }}><b>Set up your giving profile</b> so we can rank by your places and amount. <Link href="/account#giving">Add it now</Link></p>}
      <PartnerList initial={deck} mine={mine} />
    </main>
  );
}

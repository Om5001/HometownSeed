import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listCampaigns } from "@/lib/queries";
import { CampaignCard } from "@/components/CampaignCard";

export const dynamic = "force-dynamic";

export default async function Me() {
  const user = await getUser();
  if (!user) redirect("/signin?next=/me");
  const ids = await db()<{ slug: string }[]>`select c.slug from campaign_members m join campaigns c on c.id = m.campaign_id where m.user_id = ${user.id}`;
  const all = await listCampaigns({ limit: 60 });
  const mine = all.filter((c) => ids.some((i) => i.slug === c.slug));
  return (
    <main className="wrap section">
      <div className="section-head"><div><h2>Your campaigns</h2><p className="muted">Campaigns you started or help organize.</p></div><Link className="btn btn-green" href="/start">Start a campaign</Link></div>
      <div className="cards">{mine.length ? mine.map((c) => <CampaignCard key={c.id} c={c} />) : <p className="empty">You aren&apos;t organizing any campaigns yet.</p>}</div>
    </main>
  );
}

import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { getDeck, getProfile } from "@/lib/queries";
import { SwipeDeck } from "@/components/SwipeDeck";

export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const user = await requirePageUser("/match");
  const [profile, deck] = await Promise.all([getProfile(user.id), getDeck(user.id, 30)]);
  return (
    <main className="wrap">
      <div className="dash-head" style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 12 }}>
        <div className="split"><p className="eyebrow">Match</p><Link className="small" href="/connections">Your matches →</Link></div>
        <h1 style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 900, marginTop: 8 }}>Find your giving crew</h1>
        <p className="lede2">Closest places and the most similar $ per child come first. Swipe right to save a campaign or connect with a giver; swipe left to pass.</p>
        {!profile && <p className="notice" style={{ marginTop: 12 }}><b>Set up your profile</b> so we can rank by your places and amount. <Link href="/profile">Add it now</Link></p>}
      </div>
      <SwipeDeck initial={deck} />
    </main>
  );
}

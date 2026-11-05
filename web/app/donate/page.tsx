import Link from "next/link";
import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import { fundSummary, myDonations, STATES } from "@/lib/donations";
import { PLATFORM } from "@/lib/platform";
import { ago, fmt, money } from "@/lib/format";
import { DonateForm } from "@/components/DonateForm";

export const metadata: Metadata = { title: "Donate · Hometown Seed", description: "Give to the Hometown Seed Fund, which adds to coalitions so every child in a place gets an equal gift." };
export const dynamic = "force-dynamic";

export default async function Donate() {
  const [user, fund] = await Promise.all([getUser(), fundSummary()]);
  const mine = user ? await myDonations(user.id) : [];
  return (
    <main>
      <section className="wrap about-hero" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">Donate</p>
        <h1>Give to the <em>Hometown Seed Fund.</em></h1>
        <p className="lede">Don&apos;t want to run a campaign? Give to {PLATFORM.entity_name}, a 501(c)(3), and we&apos;ll put your gift to work: the Fund adds to coalitions in the places you choose when they go to Treasury, so every child there gets the same amount.</p>
      </section>

      <div className="wrap grid" style={{ marginTop: 10 }}>
        <div className="col">
          <section className="panel" id="give">
            <div className="subhead"><h3><span className="n">$</span>Your gift</h3></div>
            <DonateForm user={user ? { display_name: user.display_name, email_verified: user.email_verified } : null} states={STATES} />
          </section>
          {mine.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Your gifts to the Fund</h2></div>
              <div className="feed">{mine.map((d) => (
                <div className="don noav" key={d.id}><div><b>{money(d.cents)}{d.frequency === "monthly" ? " / month" : ""}</b><p>{d.where}</p></div><span className="amt-tag"><small>{ago(d.created_at)}</small></span></div>
              ))}</div>
            </section>
          )}
        </div>
        <div className="col">
          <section className="panel">
            <div className="panel-head"><div><p className="eyebrow">The Fund so far</p><h2 style={{ marginTop: 4 }}>{money(fund.total_cents)} pledged</h2></div></div>
            <div className="kpis" style={{ marginTop: 0 }}>
              <div className="kpi"><span className="num">{fmt(fund.donors)}</span><small>donors</small></div>
              <div className="kpi"><span className="num">{money(fund.monthly_cents)}</span><small>pledged monthly</small></div>
            </div>
            {fund.places.length > 0 && <>
              <h3 style={{ marginTop: 18 }}>Where donors asked it to go</h3>
              <div className="np-hits">{fund.places.map((p) => (
                <div className="np-hit" key={p.label}><div>{p.href ? <Link href={p.href}>{p.label}</Link> : p.label}</div><b className="num">{money(p.cents)}</b></div>
              ))}</div>
            </>}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>How the Fund works</h2></div>
            <ul className="about-list">
              <li><b>It joins coalitions.</b> When a coalition in your chosen place is ready to go to Treasury, the Fund adds to it, and the money is split evenly across every eligible child.</li>
              <li><b>Nothing is spent on one child.</b> Treasury requires equal shares, so the Fund always gives to a whole area at once.</li>
              <li><b>You can see where it went.</b> Each gift is recorded from pledge to the coalition it joined.</li>
              <li><b>Prefer to choose a campaign?</b> <Link href="/">Find one on the map</Link> or <Link href="/start">start your own</Link>.</li>
            </ul>
            <p className="small muted"><Link href="/about">About Hometown Seed</Link></p>
          </section>
          {fund.recent.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Recent gifts</h2></div>
              <div className="feed">{fund.recent.map((r, i) => (
                <div className="don noav" key={i}><div><b>{r.name}</b><p>{r.where}{r.message ? ` · “${r.message}”` : ""}</p></div>
                  <span className="amt-tag">{money(r.cents)}{r.frequency === "monthly" ? "/mo" : ""}<small>{ago(r.created_at)}</small></span></div>
              ))}</div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { HomeMap } from "@/components/HomeMap";
import { ZipSearch } from "@/components/ZipSearch";
import { CampaignCard } from "@/components/CampaignCard";
import { getRules, homeStats, listCampaigns } from "@/lib/queries";
import { fmt, moneyC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [stats, camps, rules] = await Promise.all([homeStats(), listCampaigns({ q, limit: 12 }), getRules()]);
  return (
    <main>
      <section className="wrap hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Community funding for Trump Accounts</p>
            <h1 style={{ marginTop: 12 }}>Seed every kid in <em>your ZIP code.</em></h1>
          </div>
          <div>
            <p className="lede">Pick the ZIP codes you care about and how much you hope to raise. We match you with people raising for the same kids or at the same amount per child, so together you reach the {fmt(rules.min_beneficiaries)} kids an area needs to qualify. Run it with friends, on your own, or pooled with others.</p>
            <div style={{ marginTop: 18 }}><ZipSearch /></div>
          </div>
        </div>

        <div className="capnote" role="note">
          <span className="cap-ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg></span>
          <div><b>Your gift is extra. It never uses up a child&apos;s $5,000 limit.</b>
            <p>Families can put up to $5,000 a year into each child&apos;s Trump Account. Gifts pooled here go in through a charity as a general funding contribution, split evenly across every child under 18 in the area, and that kind of contribution sits outside the yearly cap.</p></div>
        </div>

        <HomeMap minKids={rules.min_beneficiaries} />
        <div className="stats">
          <div className="stat"><span className="num">{fmt(stats.campaigns)}</span><small>active campaigns</small></div>
          <div className="stat"><span className="num">{moneyC(stats.raised)}</span><small>pledged</small></div>
          <div className="stat"><span className="num">{fmt(stats.kids)}</span><small>kids in campaign areas</small></div>
          <div className="stat"><span className="num">{fmt(stats.all_kids)}</span><small>est. eligible kids nationwide (ACS {stats.acs_year})</small></div>
        </div>
      </section>

      <section className="wrap section" id="campaigns">
        <div className="section-head">
          <div><h2>Community campaigns</h2><p style={{ color: "var(--muted)", marginTop: 6 }}>Join one, pool with one, or start your own.</p></div>
          <Link className="btn btn-green" href="/start">Start a campaign</Link>
        </div>
        <form className="camp-tools" action="/#campaigns" style={{ marginBottom: 18 }}>
          <div className="search mini" style={{ maxWidth: 420 }}>
            <label><input name="q" defaultValue={q} placeholder="Search by name, ZIP or city" aria-label="Search campaigns" /></label>
            <button className="btn btn-green" type="submit">Search</button>
          </div>
        </form>
        <div className="cards">
          {camps.length ? camps.map((c) => <CampaignCard key={c.id} c={c} />) : (
            <div className="empty-state"><p className="empty">{q ? "No campaigns match that search." : "No campaigns yet. Be the first."}</p><Link className="btn btn-green" href="/start">Start a campaign</Link></div>
          )}
        </div>
      </section>

      <section className="wrap section" id="how">
        <div className="section-head"><h2>How it works</h2></div>
        <div className="steps">
          <div className="step"><span className="n">Step 1</span><h3>Pick places and a goal</h3><p>Choose ZIP codes and how much you hope to raise. We show the estimated kids under 18 there (Census data) and what your goal means per child.</p></div>
          <div className="step"><span className="n">Step 2</span><h3>Match up or invite friends</h3><p>Pile on with campaigns already funding the same kids, or pool with ones at a similar amount per child until the area reaches {fmt(rules.min_beneficiaries)} kids, the threshold the law sets.</p></div>
          <div className="step"><span className="n">Step 3</span><h3>A charity sends it to Treasury</h3><p>When an area is ready, a partner charity submits one general funding contribution. Treasury splits it evenly into every eligible child&apos;s account.</p></div>
        </div>
      </section>
    </main>
  );
}

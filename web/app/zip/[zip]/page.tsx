import Link from "next/link";
import { notFound } from "next/navigation";
import { getRules, getZip, listCampaigns, suggestNearby } from "@/lib/queries";
import { localNonprofits, notablePledges, pledgesForZip } from "@/lib/demo";  // TEMPORARY demo
import { LocalNonprofits } from "@/components/demo/LocalNonprofits";        // TEMPORARY demo
import { NotablePledges } from "@/components/demo/NotablePledges";        // TEMPORARY demo
import { fmt, moneyC, placeLabel } from "@/lib/format";
import { AreaMap } from "@/components/AreaMap";
import { CampaignCard } from "@/components/CampaignCard";
import { ZipSearch } from "@/components/ZipSearch";

export const dynamic = "force-dynamic";

export default async function ZipPage({ params }: { params: Promise<{ zip: string }> }) {
  const { zip } = await params;
  if (!/^\d{5}$/.test(zip)) notFound();
  const z = await getZip(zip);
  if (!z) notFound();
  const [camps, nearby, rules, notable, local] = await Promise.all([listCampaigns({ zcta: zip }), suggestNearby([zip], 8), getRules(), notablePledges(), localNonprofits(zip)]);
  const ages: [string, number][] = [
    ["0–2", z.age_0_2], ["3–4", z.age_3_4], ["5", z.age_5], ["6–8", z.age_6_8], ["9–11", z.age_9_11], ["12–14", z.age_12_14], ["15–17", z.age_15_17],
  ];
  const maxAge = Math.max(...ages.map((a) => a[1] || 0), 1);
  const alone = z.kids_u18 >= rules.min_beneficiaries;
  return (
    <main>
      <div className="wrap dash-head">
        <div className="crumbs"><Link className="back" href="/">← Map</Link><div style={{ width: 300 }}><ZipSearch mini placeholder="Find a ZIP" /></div></div>
        <div className="title-row">
          <div><h1><span className="num">{z.zcta}</span> {placeLabel(z)}</h1>
            <p>About {fmt(z.kids_u18)} kids under 18 likely to have Trump Accounts.</p></div>
          <span className={"pill " + (alone ? "ok" : "gold")}>{alone ? "Can qualify on its own" : "Team up with neighbors"}</span>
        </div>
      </div>
      <div className="wrap grid">
        <div className="col">
          <section className="panel">
            <div className="panel-head"><h2>Campaigns here</h2><Link className="btn btn-green btn-sm" href={`/start?zip=${z.zcta}`}>Start one here</Link></div>
            {camps.length ? <div className="cards" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>{camps.map((c) => <CampaignCard key={c.id} c={c} />)}</div>
              : <p className="empty">No campaigns cover this ZIP yet. Start one, and we&apos;ll match you with anyone who joins nearby.</p>}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Nearby ZIP codes</h2><span className="eyebrow">to team up with</span></div>
            <div className="mlist">
              <div className="mhead"><span>ZIP</span><span>Place</span><span>Kids</span><span>Miles</span></div>
              {(nearby as (typeof nearby[number] & { miles: number })[]).map((n) => (
                <Link key={n.zcta} className="mrow" href={`/zip/${n.zcta}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="num">{n.zcta}</span><span>{placeLabel(n)}</span><span className="num">{fmt(n.kids_u18)}</span><small>{n.miles}</small>
                </Link>
              ))}
            </div>
          </section>
        </div>
        <div className="col">
          <section className="panel">
            <div className="panel-head"><h2>Area profile</h2><span className="eyebrow">ACS {z.acs_year} 5-year</span></div>
            <AreaMap zips={[z.zcta]} secondary={nearby.map((n) => n.zcta)} label={`Location of ZIP ${z.zcta}`} />
            <div className="facts" style={{ marginTop: 16 }}>
              <div className="fact"><small>Est. account holders</small><span className="num">{fmt(z.kids_u18)}</span></div>
              <div className="fact"><small>All kids under 18</small><span className="num">{fmt(z.total_u18)}</span><small>± {fmt(z.total_u18_moe)} margin of error</small></div>
              <div className="fact"><small>Median household income</small><span className="num">{z.median_hh_income ? moneyC(z.median_hh_income * 100) : "—"}</span></div>
              <div className="fact"><small>U.S. citizens under 18</small><span className="num">{z.total_u18 ? Math.round((z.citizen_u18 / z.total_u18) * 100) : 0}%</span></div>
            </div>
            <div className="ages" style={{ marginTop: 18 }}>
              {ages.map(([l, n]) => (
                <div className="age" key={l}><span>{l}</span><div className="bar"><span style={{ width: ((n || 0) / maxAge) * 100 + "%" }} /></div><span className="num">{fmt(n)}</span></div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="wrap"><NotablePledges pledges={pledgesForZip(notable, zip, z.place_state, z.median_hh_income)} zip={zip} income={z.median_hh_income} /><LocalNonprofits orgs={local} zip={zip} /></div>
    </main>
  );
}

import Link from "next/link";
import { listPlatformNonprofits } from "@/lib/nonprofits";
import { PLATFORM } from "@/lib/platform";
import { NonprofitBadge } from "@/components/NonprofitBadge";
import { NonprofitSearch } from "@/components/NonprofitSearch";

export const dynamic = "force-dynamic";
const fmtEin = (e: string) => e.slice(0, 2) + "-" + e.slice(2);

/** For people without a nonprofit of their own: who's on Hometown Seed, and search IRS/ProPublica data. */
export default async function Nonprofits({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const st = (state || "").toUpperCase().slice(0, 2);
  const list = await listPlatformNonprofits(st || undefined);
  return (
    <main className="wrap section">
      <div className="section-head"><div>
        <h2>Find a nonprofit</h2>
        <p className="muted" style={{ maxWidth: "70ch" }}>Every coalition&apos;s gift reaches Treasury through a 501(c)(3), its &ldquo;Qualified Donor.&rdquo; If nobody in your coalition represents one, you can use <b>{PLATFORM.entity_name}</b> (Hometown Seed&apos;s own), invite a nonprofit that already works here, or ask a local charity to join.</p>
      </div></div>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head"><div><p className="eyebrow">On Hometown Seed</p><h2 style={{ marginTop: 4 }}>Nonprofits with a representative here</h2></div>
          <form method="get" className="addrow" style={{ maxWidth: 220 }}><input className="input" name="state" placeholder="State (NY)" defaultValue={st} maxLength={2} aria-label="Filter by state" /><button className="btn btn-ghost btn-sm">Filter</button></form></div>
        {list.length ? (
          <div className="np-list">{list.map((n) => (
            <div className="np-card" key={n.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b>{n.name}</b><NonprofitBadge compact verified={n.verified_source !== "self"} /></div>
              <small className="muted">EIN {fmtEin(n.ein)}{n.city ? ` · ${n.city}, ${n.state}` : ""} · Represented by {n.reps.join(", ")}</small>
              {n.source_url && <small><a href={n.source_url} target="_blank" rel="noreferrer">See filings on ProPublica</a></small>}
            </div>
          ))}</div>
        ) : <p className="empty">No nonprofits {st ? `in ${st} ` : ""}have joined yet. If you represent one, <Link href="/account#nonprofit">add it on your profile</Link>.</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">All U.S. 501(c)(3)s</p><h2 style={{ marginTop: 4 }}>Search IRS records</h2></div></div>
        <p className="hint">Search by name and state. Results come from the IRS Exempt Organizations Business Master File when it&apos;s loaded, otherwise from ProPublica&apos;s Nonprofit Explorer (which republishes IRS data and 990 filings). Reach out to a local community foundation or children&apos;s charity and ask whether it will act as your coalition&apos;s Qualified Donor.</p>
        <NonprofitSearch defaultState={st} />
      </section>
    </main>
  );
}

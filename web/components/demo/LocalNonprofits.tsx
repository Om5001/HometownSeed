import type { LocalNonprofit } from "@/lib/demo";

/** TEMPORARY (demo data): real nonprofits based in the demo ZIPs, from public IRS listings. */
export function LocalNonprofits({ orgs, zip }: { orgs: LocalNonprofit[]; zip?: string }) {
  if (!orgs.length) return null;
  const fmtEin = (e: string) => e.slice(0, 2) + "-" + e.slice(2);
  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head"><div><p className="eyebrow">{zip ? `Based in ${zip}` : "Harlem Valley, NY"}</p>
        <h2 style={{ marginTop: 4 }}>Local nonprofits</h2></div><span className="tag o">Public IRS listings · not on Hometown Seed</span></div>
      <p className="hint">Real organizations registered here. They haven&apos;t joined Hometown Seed or endorsed any campaign. If one fits, reach out and ask whether it would act as your coalition&apos;s Qualified Donor (it would need to be a 501(c)(3)).</p>
      <div className="np-hits">{orgs.map((o) => (
        <div className="np-hit" key={o.ein}>
          <div><b>{o.name}</b><div className="small muted">EIN {fmtEin(o.ein)} · {o.city}, NY {o.zip}{o.focus ? ` · ${o.focus}` : ""}</div></div>
          <a className="small" href={o.source_url} target="_blank" rel="noreferrer">IRS filings on ProPublica ↗</a>
        </div>
      ))}</div>
    </section>
  );
}

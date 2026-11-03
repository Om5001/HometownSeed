import type { NotablePledge } from "@/lib/demo";

/** TEMPORARY (demo data): big publicly reported pledges to Trump Accounts. */
export function NotablePledges({ pledges, zip, income }: { pledges: (NotablePledge & { incomeOk?: boolean | null })[]; zip?: string; income?: number | null }) {
  if (!pledges.length) return null;
  const ages = (p: NotablePledge) => (p.min_age === null ? "" : `ages ${p.min_age}–${p.max_age}`);
  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head"><div><p className="eyebrow">{zip ? `Big pledges that may reach kids in ${zip}` : "Who else is giving"}</p>
        <h2 style={{ marginTop: 4 }}>{zip ? "Already pledged here" : "Big pledges to Trump Accounts"}</h2></div>
        <span className="tag o">Demo data · as reported, Oct 2026</span></div>
      <p className="hint">Publicly announced pledges, separate from Hometown Seed. They add to anything raised here. Eligibility is set by each donor; check the source.</p>
      <div className="np-hits">{pledges.map((p) => (
        <div className="np-hit" key={p.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>{p.donor}</b> <span className="small muted">· {p.amount}{p.per_child ? ` · ${p.per_child} per child` : ""}{p.form === "stock" ? " · stock" : ""}</span>
            <div className="small">{p.who}</div>
            {zip && p.income_max !== null && <div className="small muted">{p.incomeOk === true ? `✓ ${zip}'s median income ($${Number(income).toLocaleString()}) is under $${p.income_max.toLocaleString()}` : p.incomeOk === false ? `✗ ${zip}'s median income ($${Number(income).toLocaleString()}) is above $${p.income_max.toLocaleString()}` : "Income test unknown for this ZIP"}{ages(p) ? ` · ${ages(p)}` : ""}</div>}
          </div>
          <a className="small" href={p.source_url} target="_blank" rel="noreferrer">{p.source_name}{p.announced ? `, ${p.announced}` : ""} ↗</a>
        </div>
      ))}</div>
    </section>
  );
}

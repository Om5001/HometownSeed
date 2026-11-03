"use client";
import { useState } from "react";
import type { NotablePledge } from "@/lib/demo";

type P = NotablePledge & { incomeOk?: boolean | null };
/** Search by name (or the foundation a gift goes through) and choose people or organizations. */
export function usePledgeFilter<T extends { donor: string; who?: string | null; via?: string | null; donor_type: string | null }>(all: T[]) {
  const [q, setQ] = useState(""); const [type, setType] = useState<string>("");
  const t = q.trim().toLowerCase();
  const shown = all.filter((p) => (!t || p.donor.toLowerCase().includes(t) || (p.via ?? "").toLowerCase().includes(t))
    && (!type || p.donor_type === type));
  return { q, setQ, type, setType, shown };
}

export function PledgeFilters({ f, counts }: { f: ReturnType<typeof usePledgeFilter>; counts?: { person: number; organization: number } }) {
  return (
    <div className="pledge-filters">
      <input className="input" type="search" placeholder="Search a name, e.g. Dell" value={f.q} onChange={(e) => f.setQ(e.target.value)} aria-label="Search donors by name" />
      <div className="seg sm" role="group" aria-label="Show">
        {[["", "Everyone"], ["person", "People"], ["organization", "Organizations"]].map(([k, l]) => (
          <button key={k || "all"} type="button" aria-pressed={f.type === k} onClick={() => f.setType(k)}>
            {l}{counts && k ? <span className="muted"> {counts[k as "person" | "organization"]}</span> : null}</button>))}
      </div>
    </div>
  );
}

/** TEMPORARY (demo data): big publicly reported pledges to Trump Accounts. */
export function NotablePledges({ pledges, zip, income }: { pledges: P[]; zip?: string; income?: number | null }) {
  const f = usePledgeFilter(pledges);
  if (!pledges.length) return null;
  const ages = (p: NotablePledge) => (p.min_age === null ? "" : `ages ${p.min_age}–${p.max_age}`);
  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head"><div><p className="eyebrow">{zip ? `Big pledges that may reach kids in ${zip}` : "Who else is giving"}</p>
        <h2 style={{ marginTop: 4 }}>{zip ? "Already pledged here" : "Big pledges to Trump Accounts"}</h2></div>
        <span className="tag o">Demo data · as reported, Oct 2026</span></div>
      <p className="hint">Publicly announced pledges, separate from Hometown Seed. They add to anything raised here. Eligibility is set by each donor; check the source.</p>
      {pledges.length > 3 && <PledgeFilters f={f as ReturnType<typeof usePledgeFilter>}
        counts={{ person: pledges.filter((p) => p.donor_type === "person").length, organization: pledges.filter((p) => p.donor_type === "organization").length }} />}
      <div className="np-hits">{f.shown.length ? f.shown.map((p) => (
        <div className="np-hit" key={p.id}>
          <div>
            <b>{p.donor}</b>{p.via && <span className="small muted"> · via {p.via}</span>} <span className="small muted">· {p.amount}{p.per_child ? ` · ${p.per_child} per child` : ""}{p.form === "stock" ? " · stock" : ""}</span>
            <div className="small">{p.who}</div>
            {zip && p.income_max !== null && <div className="small muted">{p.incomeOk === true ? `✓ ${zip}'s median income ($${Number(income).toLocaleString()}) is under $${p.income_max.toLocaleString()}` : p.incomeOk === false ? `✗ ${zip}'s median income ($${Number(income).toLocaleString()}) is above $${p.income_max.toLocaleString()}` : "Income test unknown for this ZIP"}{ages(p) ? ` · ${ages(p)}` : ""}</div>}
          </div>
          <a className="small" href={p.source_url} target="_blank" rel="noreferrer">{p.source_name}{p.announced ? `, ${p.announced}` : ""} ↗</a>
        </div>
      )) : <p className="empty">No pledges match that filter.</p>}</div>
    </section>
  );
}

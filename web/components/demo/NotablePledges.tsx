"use client";
import { useState } from "react";
import type { NotablePledge } from "@/lib/demo";

type P = NotablePledge & { incomeOk?: boolean | null };
const TYPES = { person: "Personal gifts", foundation: "Through a foundation", company: "Companies" } as const;
const SCOPES = { national: "Nationwide", state: "One state", local: "City, county or ZIP", employees: "Employees", other: "Other" } as const;
const scopeGroup = (s: string) => (["zip", "city", "county"].includes(s) ? "local" : s);

/** Lets people narrow a pledge list by name/foundation text, donor type and reach. */
export function usePledgeFilter<T extends { donor: string; who?: string | null; via?: string | null; donor_type: string | null; scope: string }>(all: T[]) {
  const [q, setQ] = useState(""); const [type, setType] = useState<string>(""); const [scope, setScope] = useState<string>("");
  const t = q.trim().toLowerCase();
  const shown = all.filter((p) => (!t || p.donor.toLowerCase().includes(t) || (p.via ?? "").toLowerCase().includes(t) || (p.who ?? "").toLowerCase().includes(t))
    && (!type || p.donor_type === type) && (!scope || scopeGroup(p.scope) === scope));
  return { q, setQ, type, setType, scope, setScope, shown };
}

export function PledgeFilters({ f, types = true, scopes = true }: { f: ReturnType<typeof usePledgeFilter>; types?: boolean; scopes?: boolean }) {
  return (
    <div className="pfilters" style={{ alignItems: "center" }}>
      <input className="input" style={{ width: 220, padding: "7px 10px" }} placeholder="Search names or foundations" value={f.q} onChange={(e) => f.setQ(e.target.value)} aria-label="Search pledges by name or foundation" />
      {types && Object.entries(TYPES).map(([k, v]) => <button key={k} type="button" aria-pressed={f.type === k} onClick={() => f.setType(f.type === k ? "" : k)}>{v}</button>)}
      {scopes && Object.entries(SCOPES).map(([k, v]) => <button key={k} type="button" aria-pressed={f.scope === k} onClick={() => f.setScope(f.scope === k ? "" : k)}>{v}</button>)}
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
      {pledges.length > 3 && <PledgeFilters f={f as ReturnType<typeof usePledgeFilter>} scopes={!zip} />}
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

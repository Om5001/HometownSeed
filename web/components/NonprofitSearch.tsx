"use client";
import { useState } from "react";

type Hit = { ein: string; name: string; city: string | null; state: string | null; ntee_code: string | null; url: string };
const fmtEin = (e: string) => e.slice(0, 2) + "-" + e.slice(2);

export function NonprofitSearch({ defaultState = "" }: { defaultState?: string }) {
  const [q, setQ] = useState(""); const [st, setSt] = useState(defaultState);
  const [hits, setHits] = useState<Hit[] | null>(null); const [source, setSource] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/nonprofits/search?q=${encodeURIComponent(q)}&state=${encodeURIComponent(st)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setHits(d.hits); setSource(d.source);
    } catch (x) { setErr((x as Error).message || "Search failed."); } finally { setBusy(false); }
  };
  return (
    <div>
      <form onSubmit={go} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        <label className="field" style={{ flex: "1 1 260px" }}><span>Name or EIN</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="community foundation" /></label>
        <label className="field" style={{ width: 100 }}><span>State</span><input className="input" value={st} maxLength={2} onChange={(e) => setSt(e.target.value.toUpperCase())} placeholder="NY" /></label>
        <button className="btn btn-green btn-sm" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>
      {err && <p className="err">{err}</p>}
      {hits && (
        <div className="np-hits">
          <p className="small muted">{hits.length ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "No matches."} Source: {source === "irs" ? "IRS exempt-organization file" : "ProPublica Nonprofit Explorer"}</p>
          {hits.map((h) => (
            <div className="np-hit" key={h.ein}>
              <div><b>{h.name}</b><div className="small muted">EIN {fmtEin(h.ein)}{h.city ? ` · ${h.city}, ${h.state}` : ""}{h.ntee_code ? ` · NTEE ${h.ntee_code}` : ""}</div></div>
              <a className="small" href={h.url} target="_blank" rel="noreferrer">Details ↗</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

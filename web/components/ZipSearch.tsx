"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, placeLabel } from "@/lib/format";

type Hit = { zcta: string; place_name: string | null; place_state: string | null; kids_u18: number };

/** ZIP or city search. onPick lets the builder add a ZIP instead of navigating. */
export function ZipSearch({ onPick, placeholder = "Enter a ZIP code or city", button = "Go", mini = false, autoFocus = false }:
  { onPick?: (h: Hit) => void; placeholder?: string; button?: string; mini?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[]>([]); const [err, setErr] = useState("");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    const v = q.trim();
    if (v.length < 2) { setHits([]); return; }
    t.current = setTimeout(async () => {
      const r = await fetch("/api/search?q=" + encodeURIComponent(v)); setHits(r.ok ? await r.json() : []);
    }, 180);
  }, [q]);
  const pick = (h: Hit) => { setQ(""); setHits([]); setErr(""); onPick ? onPick(h) : router.push(`/zip/${h.zcta}`); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (hits.length) return pick(hits.find((h) => h.zcta === v) ?? hits[0]);
    setErr(/^\d{5}$/.test(v) ? "We don't have Census data for that ZIP (it may be a PO box or business ZIP)." : "Enter a 5-digit ZIP code or a city name.");
  };
  return (
    <div className="combo">
      <form className={"search" + (mini ? " mini" : "")} onSubmit={submit} noValidate>
        <label>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ color: "var(--muted)", flex: "none" }}><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoFocus={autoFocus} />
        </label>
        <button className="btn btn-green" type="submit">{button}</button>
      </form>
      {hits.length > 0 && (
        <div className="sugg" role="listbox">
          {hits.map((h) => (
            <button type="button" key={h.zcta} onClick={() => pick(h)}>
              <span><span className="num">{h.zcta}</span> · {placeLabel(h)}</span><small>{fmt(h.kids_u18)} kids</small>
            </button>
          ))}
        </div>
      )}
      {err && <p className="search-err" role="alert">{err}</p>}
    </div>
  );
}

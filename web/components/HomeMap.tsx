"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { geoPath } from "d3-geo";
import { quadtree, type Quadtree } from "d3-quadtree";
import { H, W, cssVar, loadCoverage, loadPledgeMap, loadPoints, loadStates, sizeCanvas, type Cover, type PledgeMap, type Pt } from "@/lib/mapdata";
import { fmt, moneyC } from "@/lib/format";

type Layer = "campaigns" | "pledges";
// $ per child (under 18) bins for the pledge layer, light to dark
const BINS = [100, 200, 300];            // dollars
const BIN_COLORS = ["#c7dcef", "#8fb6dc", "#4a83c0", "#1d4f91"];
const binOf = (d: number) => (d < BINS[0] ? 0 : d < BINS[1] ? 1 : d < BINS[2] ? 2 : 3);

/** National dot map: one dot per ZIP area. Two layers: Hometown Seed campaigns, and where big announced pledges go. */
export function HomeMap({ minKids = 5000 }: { minKids?: number }) {
  const router = useRouter();
  const base = useRef<HTMLCanvasElement>(null), ov = useRef<HTMLCanvasElement>(null);
  const [layer, setLayer] = useState<Layer>("campaigns");
  const [picked, setPicked] = useState<string[]>([]);     // chosen pledge ids; none = all
  const [q, setQ] = useState("");                          // search names or foundations
  const [dtype, setDtype] = useState("");                  // person | foundation | company
  const [pm, setPm] = useState<PledgeMap | null>(null);
  const [hover, setHover] = useState<(Pt & { c?: Cover }) | null>(null);
  const [err, setErr] = useState("");
  const data = useRef<{ pts: Pt[]; cov: Map<string, Cover>; qt: Quadtree<Pt>; k: number } | null>(null);

  useEffect(() => { if (layer === "pledges" && !pm) loadPledgeMap().then(setPm).catch(() => setErr("The pledge layer couldn't load.")); }, [layer, pm]);
  const matches = (p: PledgeMap["pledges"][number]) =>
    (!q.trim() || p.donor.toLowerCase().includes(q.trim().toLowerCase())) && (!dtype || p.donor_type === dtype);
  const active = useMemo(() => (pm ? pm.pledges.map((p, i) => ((picked.length ? picked.includes(p.id) : true) && matches(p) ? i : -1)).filter((i) => i >= 0) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pm, picked, q, dtype]);
  const dollarsAt = (z: string) => {
    const row = pm?.byZip.get(z); if (!row) return 0;
    let c = 0; for (const i of active) c += row[i] ?? 0; return c / 100;
  };

  useEffect(() => {
    let alive = true;
    const draw = async () => {
      try {
        const [pts, geo, cov] = await Promise.all([loadPoints(), loadStates(), loadCoverage()]);
        if (!alive || !base.current) return;
        const mapped = pts.filter((p) => p.x !== null);
        const { ctx, k } = sizeCanvas(base.current, W, H);
        sizeCanvas(ov.current!, W, H);
        ctx.clearRect(0, 0, W, H);
        const path = geoPath(null, ctx);
        ctx.beginPath(); path(geo.nation); ctx.fillStyle = cssVar("--land"); ctx.fill();
        ctx.beginPath(); path(geo.borders); ctx.strokeStyle = cssVar("--border-state"); ctx.lineWidth = 0.7 / Math.max(k, 0.5); ctx.stroke();

        if (layer === "pledges") {
          ctx.fillStyle = cssVar("--dot");
          const buckets: Pt[][] = [[], [], [], []];
          for (const p of mapped) {
            const d = pm ? dollarsAt(p.z) : 0;
            if (!d || !p.k) { ctx.fillRect(p.x! - 0.55, p.y! - 0.55, 1.1, 1.1); continue; }
            buckets[binOf(d / p.k)].push(p);
          }
          buckets.forEach((b, i) => {
            ctx.fillStyle = BIN_COLORS[i];
            for (const p of b) { ctx.beginPath(); ctx.arc(p.x!, p.y!, 1.15 + i * 0.25, 0, 6.2832); ctx.fill(); }
          });
        } else {
          ctx.fillStyle = cssVar("--dot");
          for (const p of mapped) if (p.k < minKids && !cov.has(p.z)) ctx.fillRect(p.x! - 0.55, p.y! - 0.55, 1.1, 1.1);
          ctx.fillStyle = cssVar("--navy"); ctx.globalAlpha = 0.3;
          for (const p of mapped) if (p.k >= minKids && !cov.has(p.z)) { ctx.beginPath(); ctx.arc(p.x!, p.y!, 1.05, 0, 6.2832); ctx.fill(); }
          ctx.globalAlpha = 1;
        }
        // Hometown Seed campaigns always sit on top
        const gold = cssVar("--gold"), green = cssVar("--green"), surf = cssVar("--surface");
        for (const p of mapped) {
          const c = cov.get(p.z); if (!c) continue;
          ctx.beginPath(); ctx.arc(p.x!, p.y!, 4.2, 0, 6.2832); ctx.fillStyle = surf; ctx.fill();
          ctx.beginPath(); ctx.arc(p.x!, p.y!, 3.2, 0, 6.2832); ctx.fillStyle = c.s === 2 ? green : gold; ctx.fill();
        }
        data.current = { pts: mapped, cov, qt: quadtree<Pt>().x((p) => p.x!).y((p) => p.y!).addAll(mapped), k };
      } catch {
        if (alive) setErr("The map couldn't load. Check that the Census data pipeline has run.");
      }
    };
    draw();
    const ro = new ResizeObserver(() => draw());
    if (base.current) ro.observe(base.current);
    return () => { alive = false; ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minKids, layer, pm, active]);

  useEffect(() => {
    const cv = ov.current; if (!cv) return;
    const { ctx } = sizeCanvas(cv, W, H);
    ctx.clearRect(0, 0, W, H);
    if (!hover || hover.x === null) return;
    ctx.beginPath(); ctx.arc(hover.x, hover.y!, 6.5, 0, 6.2832);
    ctx.lineWidth = 2.2; ctx.strokeStyle = cssVar("--ink"); ctx.stroke();
  }, [hover]);

  const at = (e: React.MouseEvent) => {
    const d = data.current; if (!d) return null;
    const r = ov.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    return d.qt.find(x, y, 9 / Math.max(d.k, 0.4)) ?? null;
  };
  const tipPledges = (z: string) => {
    const row = pm?.byZip.get(z); if (!row || !pm) return [];
    return active.filter((i) => row[i]).map((i) => ({ donor: pm.pledges[i].donor, dollars: row[i] / 100 }));
  };
  const totals = pm ? active.reduce((a, i) => ({ c: a.c + pm.pledges[i].total_cents, z: Math.max(a.z, pm.pledges[i].zips) }), { c: 0, z: 0 }) : null;

  return (
    <div className="mapcard">
      <div className="split" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div className="seg" role="group" aria-label="Map layer">
          <button type="button" aria-pressed={layer === "campaigns"} onClick={() => setLayer("campaigns")}>Campaigns</button>
          <button type="button" aria-pressed={layer === "pledges"} onClick={() => setLayer("pledges")}>Big pledges</button>
        </div>
        {layer === "pledges" && pm && pm.pledges.length > 0 && (
          <input className="input" style={{ width: 230, padding: "7px 10px" }} placeholder="Search names or foundations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pledges by name or foundation" />
        )}
      </div>
      {layer === "pledges" && pm && pm.pledges.length > 0 && (
        <div className="pfilters" role="group" aria-label="Pledges shown on the map">
          {[["", "All types"], ["person", "People"], ["foundation", "Foundations"], ["company", "Companies"]].map(([k, v]) => (
            <button key={k || "all"} type="button" aria-pressed={dtype === k} onClick={() => setDtype(k)}>{v}</button>))}
          <span className="small muted" style={{ alignSelf: "center" }}>·</span>
          {pm.pledges.filter(matches).map((p) => (
            <button key={p.id} type="button" aria-pressed={picked.includes(p.id)} title={`≈ ${moneyC(p.total_cents)} mapped`}
              onClick={() => setPicked((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}>{p.donor}</button>
          ))}
          {picked.length > 0 && <button type="button" onClick={() => setPicked([])}>Show all</button>}
          {pm.pledges.filter(matches).length === 0 && <span className="small muted">No mapped pledge matches.</span>}
        </div>
      )}
      {layer === "campaigns" ? (
        <div className="legend">
          <span><i style={{ background: "var(--green)" }} />Campaign area with 5,000+ kids</span>
          <span><i style={{ background: "var(--gold)" }} />Campaign still building to 5,000</span>
          <span><i style={{ background: "var(--navy)", opacity: 0.5 }} />ZIP with 5,000+ kids on its own</span>
          <span><i style={{ background: "var(--dot)" }} />Smaller ZIP (can team up)</span>
        </div>
      ) : (
        <div className="legend">
          <span className="small"><b>Estimated pledged $ per child</b> (under 18):</span>
          {BIN_COLORS.map((c, i) => <span key={c}><i style={{ background: c }} />{i === 0 ? `under $${BINS[0]}` : i === 3 ? `$${BINS[2]}+` : `$${BINS[i - 1]}–${BINS[i] - 1}`}</span>)}
          <span><i style={{ background: "var(--dot)" }} />none mapped</span>
          <span><i style={{ background: "var(--green)" }} />Hometown Seed campaign</span>
        </div>
      )}
      <div className="mapstage">
        <canvas ref={base} aria-hidden="true" />
        <canvas ref={ov} className={"ov" + (hover ? " hot" : "")} role="img"
          aria-label={layer === "pledges" ? "Map of U.S. ZIP code areas shaded by estimated dollars per child from big announced pledges." : "Map of U.S. ZIP code areas. Colored dots show ZIP codes in active campaigns."}
          onMouseMove={(e) => { const p = at(e); setHover(p ? { ...p, c: data.current?.cov.get(p.z) } : null); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const p = at(e); if (p) router.push(`/zip/${p.z}`); }} />
        {hover && hover.x !== null && (
          <div className="tip" style={{ left: (hover.x / W) * 100 + "%", top: (hover.y! / H) * 100 + "%" }}>
            <b>{hover.z}</b> · {fmt(hover.k)} kids
            <br />
            {layer === "pledges" ? (() => {
              const list = tipPledges(hover.z), sum = list.reduce((a, b) => a + b.dollars, 0);
              return list.length ? <>
                <span className="ok">≈ ${fmt(sum)} pledged · ≈ ${fmt(hover.k ? sum / hover.k : 0)} per child</span>
                {list.map((l) => <div key={l.donor} className="small">{l.donor}: ≈ ${fmt(l.dollars)}</div>)}
              </> : "No mapped pledge covers this ZIP";
            })() : hover.c ? <span className="ok">{hover.c.n} campaign{hover.c.n > 1 ? "s" : ""} · {moneyC(hover.c.raised)} pledged</span>
              : hover.k >= minKids ? "Can qualify on its own" : "Can team up with neighbors"}
          </div>
        )}
      </div>
      {err ? <p className="err" style={{ marginTop: 10 }}>{err}</p> : layer === "pledges" ? (
        <div className="maphint">
          {!pm ? "Loading pledges…" : pm.pledges.length === 0 ? "No pledge data loaded." : <>
            Estimates from public announcements, not money managed by Hometown Seed: eligible kids by age, state and ZIP income, times each donor&apos;s amount per child
            {totals ? <> (≈ {moneyC(totals.c)} across {fmt(totals.z)} ZIP codes for this selection)</> : null}. Demo data; check each donor&apos;s terms.
            {pm.pledges.filter((p) => active.includes(pm.pledges.indexOf(p)) && p.map_note).map((p) => <span key={p.id}> {p.donor}: {p.map_note}</span>)}
            {pm.unmapped.length > 0 && <> Not mapped: {pm.unmapped.map((u) => u.donor).join(", ")} (recipients can&apos;t be placed by ZIP).</>}
          </>}
        </div>
      ) : <p className="maphint">Hover a dot for details. Click to see that ZIP code and its campaigns.</p>}
    </div>
  );
}

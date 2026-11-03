"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { geoPath } from "d3-geo";
import { quadtree, type Quadtree } from "d3-quadtree";
import { H, W, cssVar, loadCoverage, loadPledgeMap, loadPoints, loadStates, sizeCanvas, type Cover, type PledgeMap, type Pt } from "@/lib/mapdata";
import { fmt, moneyC } from "@/lib/format";

type Layer = "campaigns" | "pledges";
type View = { k: number; x: number; y: number };   // zoom and pan, in map units (W x H)
const BIN_COLORS = ["#c7dcef", "#8fb6dc", "#4a83c0", "#1d4f91"];
// Gifts aimed at one state, city, county or ZIP get their own bold color so they stand out
const TARGET_COLORS = ["#e4572e", "#a23b72", "#f29e4c", "#2a9d8f", "#7b2cbf", "#d62828", "#00916e"];
const MAX_K = 40;

/** National dot map, zoomable. Two layers: Hometown Seed campaigns, and where big announced pledges go. */
export function HomeMap({ minKids = 5000 }: { minKids?: number }) {
  const router = useRouter();
  const base = useRef<HTMLCanvasElement>(null), ov = useRef<HTMLCanvasElement>(null);
  const [layer, setLayer] = useState<Layer>("campaigns");
  const [picked, setPicked] = useState("");                 // one donor's pledge id, or "" for everyone
  const [q, setQ] = useState("");                          // search by name
  const [pm, setPm] = useState<PledgeMap | null>(null);
  const [hover, setHover] = useState<(Pt & { c?: Cover }) | null>(null);
  const [err, setErr] = useState("");
  const [hint, setHint] = useState(false);
  const store = useRef<{ pts: Pt[]; geo: Awaited<ReturnType<typeof loadStates>>; cov: Map<string, Cover>; qt: Quadtree<Pt> } | null>(null);
  const [ready, setReady] = useState(0);
  const view = useRef<View>({ k: 1, x: 0, y: 0 });
  const [tick, setTick] = useState(0);                     // redraw after zoom/pan
  const scale = useRef(1);                                 // canvas px per map unit

  useEffect(() => {
    Promise.all([loadPoints(), loadStates(), loadCoverage()]).then(([pts, geo, cov]) => {
      const mapped = pts.filter((p) => p.x !== null);
      store.current = { pts: mapped, geo, cov, qt: quadtree<Pt>().x((p) => p.x!).y((p) => p.y!).addAll(mapped) };
      setReady((r) => r + 1);
    }).catch(() => setErr("The map couldn't load. Check that the Census data pipeline has run."));
  }, []);
  useEffect(() => { if (layer === "pledges" && !pm) loadPledgeMap().then(setPm).catch(() => setErr("The pledge layer couldn't load.")); }, [layer, pm]);

  const matches = useCallback((p: PledgeMap["pledges"][number]) => {
    const t = q.trim().toLowerCase();
    return !t || p.donor.toLowerCase().includes(t) || (p.via ?? "").toLowerCase().includes(t);
  }, [q]);
  const active = useMemo(() => (pm ? pm.pledges.map((p, i) => ((picked ? p.id === picked : matches(p)) ? i : -1)).filter((i) => i >= 0) : []), [pm, picked, matches]);
  const targeted = useMemo(() => (pm ? active.filter((i) => pm.pledges[i].scope !== "national") : []), [pm, active]);
  const broad = useMemo(() => (pm ? active.filter((i) => pm.pledges[i].scope === "national") : []), [pm, active]);
  const colorOf = useCallback((i: number) => TARGET_COLORS[(pm?.pledges.filter((p) => p.scope !== "national").findIndex((p) => p.id === pm.pledges[i].id) ?? 0) % TARGET_COLORS.length], [pm]);

  // $ per child (under 18) from the broad pledges, with bins that adapt to what's selected
  const perKid = useMemo(() => {
    const m = new Map<string, number>(); if (!pm || !store.current) return { m, cuts: [0, 0, 0] };
    const vals: number[] = [];
    for (const p of store.current.pts) {
      const row = pm.byZip.get(p.z); if (!row || !p.k) continue;
      let c = 0; for (const i of broad) c += row[i] ?? 0;
      if (c > 0) { const v = c / 100 / p.k; m.set(p.z, v); vals.push(v); }
    }
    vals.sort((a, b) => a - b);
    const qn = (f: number) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(f * vals.length))] : 0;
    // round to friendly dollar amounts and keep the three cut points increasing
    const nice = (x: number) => (x < 20 ? Math.round(x) : x < 200 ? Math.round(x / 5) * 5 : Math.round(x / 25) * 25);
    const cuts = [nice(qn(0.25)), nice(qn(0.5)), nice(qn(0.8))];
    for (let i = 1; i < 3; i++) if (cuts[i] <= cuts[i - 1]) cuts[i] = cuts[i - 1] + 1;
    return { m, cuts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pm, broad, ready]);
  const binOf = (v: number) => (v < perKid.cuts[0] ? 0 : v < perKid.cuts[1] ? 1 : v < perKid.cuts[2] ? 2 : 3);

  const draw = useCallback(() => {
    const s = store.current, cv = base.current; if (!s || !cv) return;
    const { ctx, k: sc } = sizeCanvas(cv, W, H);
    scale.current = sc;
    const v = view.current;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.transform(v.k, 0, 0, v.k, v.x, v.y);
    const z = v.k, r = (n: number) => n / Math.pow(z, 0.55);   // dots grow a little as you zoom, not a lot
    const path = geoPath(null, ctx);
    ctx.beginPath(); path(s.geo.nation); ctx.fillStyle = cssVar("--land"); ctx.fill();
    ctx.beginPath(); path(s.geo.borders); ctx.strokeStyle = cssVar("--border-state"); ctx.lineWidth = 0.7 / Math.max(sc, 0.5) / z; ctx.stroke();
    // only draw what's on screen
    const x0 = -v.x / z - 5, y0 = -v.y / z - 5, x1 = (W - v.x) / z + 5, y1 = (H - v.y) / z + 5;
    const pts = s.pts.filter((p) => p.x! >= x0 && p.x! <= x1 && p.y! >= y0 && p.y! <= y1);
    const dot = (p: Pt, rad: number) => { ctx.beginPath(); ctx.arc(p.x!, p.y!, rad, 0, 6.2832); ctx.fill(); };

    if (layer === "pledges") {
      ctx.fillStyle = cssVar("--dot");
      const buckets: Pt[][] = [[], [], [], []];
      for (const p of pts) { const val = perKid.m.get(p.z); if (val === undefined) { const d = r(0.55); ctx.fillRect(p.x! - d, p.y! - d, d * 2, d * 2); } else buckets[binOf(val)].push(p); }
      buckets.forEach((b, i) => { ctx.fillStyle = BIN_COLORS[i]; for (const p of b) dot(p, r(1.15 + i * 0.25)); });
      // targeted gifts on top, bold, with a label
      if (pm) for (const i of targeted) {
        const col = colorOf(i), covered = s.pts.filter((p) => (pm.byZip.get(p.z)?.[i] ?? 0) > 0);
        if (!covered.length) continue;
        const cx = covered.reduce((a, p) => a + p.x!, 0) / covered.length, cy = covered.reduce((a, p) => a + p.y!, 0) / covered.length;
        // soft halo so small, local gifts are easy to spot from the national view
        ctx.globalAlpha = 0.18; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r(16), 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = cssVar("--surface");
        for (const p of covered) dot(p, r(3.4));
        ctx.fillStyle = col;
        for (const p of covered) dot(p, r(2.5));
        const pl = pm.pledges[i];
        const label = `${pl.donor}${pl.per_child_cents ? ` · $${fmt(pl.per_child_cents / 100)}/child` : ""}`;
        const fs = 12.5 / Math.max(sc, 0.5) / z;
        ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textBaseline = "middle";
        // put the label on whichever side of the dots has room on screen
        const gap = 9 / Math.max(sc, 0.5) / z, wdt = ctx.measureText(label).width, right = (W - v.x) / z;
        const left = cx + gap + wdt > right;
        ctx.textAlign = left ? "right" : "left";
        const tx = left ? cx - gap : cx + gap;
        ctx.lineJoin = "round"; ctx.lineWidth = fs * 0.35; ctx.strokeStyle = cssVar("--surface"); ctx.strokeText(label, tx, cy);
        ctx.fillStyle = col; ctx.fillText(label, tx, cy); ctx.textAlign = "left";
      }
    } else {
      ctx.fillStyle = cssVar("--dot");
      for (const p of pts) if (p.k < minKids && !s.cov.has(p.z)) { const d = r(0.55); ctx.fillRect(p.x! - d, p.y! - d, d * 2, d * 2); }
      ctx.fillStyle = cssVar("--navy"); ctx.globalAlpha = 0.3;
      for (const p of pts) if (p.k >= minKids && !s.cov.has(p.z)) dot(p, r(1.05));
      ctx.globalAlpha = 1;
    }
    // Hometown Seed campaigns always sit on top
    const gold = cssVar("--gold"), green = cssVar("--green"), surf = cssVar("--surface");
    for (const p of pts) {
      const c = s.cov.get(p.z); if (!c) continue;
      ctx.fillStyle = surf; dot(p, r(4.2));
      ctx.fillStyle = c.s === 2 ? green : gold; dot(p, r(3.2));
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, pm, targeted, perKid, minKids, colorOf]);

  useEffect(() => { draw(); }, [draw, ready, tick]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (base.current) ro.observe(base.current);
    return () => ro.disconnect();
  }, [draw]);

  // hover ring
  useEffect(() => {
    const cv = ov.current; if (!cv) return;
    const { ctx } = sizeCanvas(cv, W, H);
    ctx.clearRect(0, 0, W, H);
    if (!hover || hover.x === null) return;
    const v = view.current;
    ctx.beginPath(); ctx.arc(hover.x * v.k + v.x, hover.y! * v.k + v.y, 6.5, 0, 6.2832);
    ctx.lineWidth = 2.2; ctx.strokeStyle = cssVar("--ink"); ctx.stroke();
  }, [hover, tick]);

  // --- zoom and pan -------------------------------------------------------------
  const clamp = (v: View): View => {
    const k = Math.min(MAX_K, Math.max(1, v.k));
    return { k, x: Math.min(0, Math.max(W - W * k, v.x)), y: Math.min(0, Math.max(H - H * k, v.y)) };
  };
  const zoomAt = useCallback((factor: number, mx = W / 2, my = H / 2) => {
    const v = view.current, k = Math.min(MAX_K, Math.max(1, v.k * factor));
    view.current = clamp({ k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) });
    setTick((t) => t + 1);
  }, []);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = ov.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const at = (e: { clientX: number; clientY: number }) => {
    const s = store.current; if (!s) return null;
    const m = local(e), v = view.current;
    return s.qt.find((m.x - v.x) / v.k, (m.y - v.y) / v.k, 9 / Math.max(scale.current, 0.4) / v.k) ?? null;
  };

  useEffect(() => {
    const cv = ov.current; if (!cv) return;
    let t: ReturnType<typeof setTimeout>;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) && view.current.k === 1) { setHint(true); clearTimeout(t); t = setTimeout(() => setHint(false), 1400); return; }
      e.preventDefault();
      const m = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), m.x, m.y);
    };
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => { cv.removeEventListener("wheel", wheel); clearTimeout(t); };
  }, [zoomAt]);

  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: number; pinch?: number } | null>(null);
  const clickT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { moved: 0 };
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev || !drag.current) { const p = at(e); setHover(p ? { ...p, c: store.current?.cov.get(p.z) } : null); return; }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && drag.current.pinch) {
      const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomAt(d / drag.current.pinch, m.x, m.y); drag.current.pinch = d; drag.current.moved += 10; return;
    }
    const rect = ov.current!.getBoundingClientRect(), f = W / rect.width;
    const dx = (e.clientX - prev.x) * f, dy = (e.clientY - prev.y) * f;
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (view.current.k > 1) { view.current = clamp({ ...view.current, x: view.current.x + dx, y: view.current.y + dy }); setTick((t) => t + 1); setHover(null); }
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    const d = drag.current; if (ptrs.current.size === 0) drag.current = null;
    // a single click opens the ZIP; wait a moment so a double-click can zoom instead
    if (d && d.moved < 6) { const p = at(e); if (p) { clearTimeout(clickT.current); clickT.current = setTimeout(() => router.push(`/zip/${p.z}`), 280); } }
  };

  const tipPledges = (zc: string) => {
    const row = pm?.byZip.get(zc); if (!row || !pm) return [];
    return active.filter((i) => row[i]).map((i) => ({ donor: pm.pledges[i].donor, dollars: row[i] / 100, targeted: pm.pledges[i].scope !== "national", i }));
  };
  const totals = pm ? active.reduce((a, i) => ({ c: a.c + pm.pledges[i].total_cents, z: Math.max(a.z, pm.pledges[i].zips) }), { c: 0, z: 0 }) : null;
  const v = view.current;
  const money = (d: number) => "$" + fmt(d);

  return (
    <div className="mapcard">
      <div className="split" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div className="seg" role="group" aria-label="Map layer">
          <button type="button" aria-pressed={layer === "campaigns"} onClick={() => setLayer("campaigns")}>Campaigns</button>
          <button type="button" aria-pressed={layer === "pledges"} onClick={() => setLayer("pledges")}>Big pledges</button>
        </div>
        {layer === "pledges" && pm && pm.pledges.length > 0 && (() => {
          const opts = pm.pledges.filter(matches);
          const group = (t: string) => opts.filter((p) => p.donor_type === t);
          return (
            <div className="donor-pick">
              <input className="input" type="search" placeholder="Search a name, e.g. Dell" value={q}
                onChange={(e) => { setQ(e.target.value); setPicked(""); }} aria-label="Search donors by name" />
              <select className="input" value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Show one donor">
                <option value="">{q.trim() ? `All matches (${opts.length})` : `Everyone (${pm.pledges.length})`}</option>
                {group("person").length > 0 && <optgroup label="People">{group("person").map((p) => <option key={p.id} value={p.id}>{p.donor}</option>)}</optgroup>}
                {group("organization").length > 0 && <optgroup label="Organizations">{group("organization").map((p) => <option key={p.id} value={p.id}>{p.donor}</option>)}</optgroup>}
              </select>
            </div>
          );
        })()}
      </div>
      {layer === "pledges" && pm && q.trim() && !active.length && <p className="small muted" style={{ margin: "0 0 8px" }}>No mapped donor matches &ldquo;{q.trim()}&rdquo;.</p>}
      {layer === "pledges" && pm && picked && (() => {
        const p = pm.pledges.find((x) => x.id === picked);
        return p ? <p className="small" style={{ margin: "0 0 8px" }}><b>{p.donor}</b>{p.via ? <span className="muted"> · via {p.via}</span> : null} · {p.zips
          ? <>≈ {moneyC(p.total_cents)} across {fmt(p.zips)} ZIP code{p.zips === 1 ? "" : "s"}</>
          : <>none of this donor&apos;s ZIP codes are in the loaded Census data</>} · <button type="button" className="linkish" onClick={() => setPicked("")}>show everyone</button></p> : null;
      })()}
      {layer === "campaigns" ? (
        <div className="legend">
          <span><i style={{ background: "var(--green)" }} />Campaign area with 5,000+ kids</span>
          <span><i style={{ background: "var(--gold)" }} />Campaign still building to 5,000</span>
          <span><i style={{ background: "var(--navy)", opacity: 0.5 }} />ZIP with 5,000+ kids on its own</span>
          <span><i style={{ background: "var(--dot)" }} />Smaller ZIP (can team up)</span>
        </div>
      ) : (
        <div className="legend">
          {broad.length > 0 && <>
            <span className="small"><b>Nationwide pledges, est. $ per child</b> (under 18):</span>
            {BIN_COLORS.map((c, i) => <span key={c}><i style={{ background: c }} />{i === 0 ? `under ${money(perKid.cuts[0])}` : i === 3 ? `${money(perKid.cuts[2])}+` : `${money(perKid.cuts[i - 1])}–${money(perKid.cuts[i])}`}</span>)}
          </>}
          {pm && targeted.length > 0 && <span className="small"><b>Targeted gifts:</b></span>}
          {pm && targeted.map((i) => <span key={i}><i style={{ background: colorOf(i) }} />{pm.pledges[i].donor}</span>)}
          <span><i style={{ background: "var(--green)" }} />Hometown Seed campaign</span>
        </div>
      )}
      <div className="mapstage">
        <canvas ref={base} aria-hidden="true" />
        <canvas ref={ov} className={"ov" + (hover ? " hot" : "") + (v.k > 1 ? " zoomed" : "")} role="img"
          aria-label={layer === "pledges" ? "Map of U.S. ZIP code areas shaded by estimated dollars per child from big announced pledges. Zoom with the plus and minus buttons." : "Map of U.S. ZIP code areas. Colored dots show ZIP codes in active campaigns. Zoom with the plus and minus buttons."}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={() => { if (!drag.current) setHover(null); }}
          onDoubleClick={(e) => { clearTimeout(clickT.current); const m = local(e); zoomAt(2.2, m.x, m.y); }} />
        <div className="zoombox" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(2)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(0.5)} disabled={v.k <= 1}>−</button>
          <button type="button" aria-label="Reset zoom" onClick={() => { view.current = { k: 1, x: 0, y: 0 }; setTick((t) => t + 1); }} disabled={v.k <= 1} title="Whole country">⟲</button>
        </div>
        {hint && <div className="zoomhint">Hold Ctrl (⌘ on Mac) and scroll to zoom, or use + and −</div>}
        {hover && hover.x !== null && (
          <div className="tip" style={{ left: ((hover.x * v.k + v.x) / W) * 100 + "%", top: ((hover.y! * v.k + v.y) / H) * 100 + "%" }}>
            <b>{hover.z}</b> · {fmt(hover.k)} kids
            <br />
            {layer === "pledges" ? (() => {
              const list = tipPledges(hover.z), sum = list.reduce((a, b) => a + b.dollars, 0);
              return list.length ? <>
                <span className="ok">≈ ${fmt(sum)} pledged · ≈ ${fmt(hover.k ? sum / hover.k : 0)} per child</span>
                {list.map((l) => <div key={l.donor} className="small">{l.targeted && <i className="swatch" style={{ background: colorOf(l.i) }} />}{l.donor}: ≈ ${fmt(l.dollars)}</div>)}
              </> : "No mapped pledge covers this ZIP";
            })() : hover.c ? <span className="ok">{hover.c.n} campaign{hover.c.n > 1 ? "s" : ""} · {moneyC(hover.c.raised)} pledged</span>
              : hover.k >= minKids ? "Can qualify on its own" : "Can team up with neighbors"}
          </div>
        )}
      </div>
      {err ? <p className="err" style={{ marginTop: 10 }}>{err}</p> : layer === "pledges" ? (
        <div className="maphint">
          {!pm ? "Loading pledges…" : pm.pledges.length === 0 ? "No pledge data loaded." : <>
            Zoom with + and − (or Ctrl/⌘ + scroll, or pinch), drag to move. Estimates from public announcements, not money managed by Hometown Seed: eligible kids by age, place and ZIP income, times each donor&apos;s amount per child
            {totals ? <> (≈ {moneyC(totals.c)} for this selection)</> : null}. Demo data; check each donor&apos;s terms.
            {pm.pledges.filter((p) => active.includes(pm.pledges.indexOf(p)) && p.map_note).map((p) => <span key={p.id}> {p.donor}: {p.map_note}</span>)}
            {pm.unmapped.length > 0 && <> Not mapped: {pm.unmapped.map((u) => u.donor).join(", ")} (recipients can&apos;t be placed by ZIP).</>}
          </>}
        </div>
      ) : <p className="maphint">Hover a dot for details; click to open that ZIP code. Zoom with + and − (or Ctrl/⌘ + scroll, or pinch) and drag to move.</p>}
    </div>
  );
}

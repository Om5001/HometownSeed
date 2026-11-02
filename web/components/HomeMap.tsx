"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { geoPath } from "d3-geo";
import { quadtree, type Quadtree } from "d3-quadtree";
import { H, W, cssVar, loadCoverage, loadPoints, loadStates, sizeCanvas, type Cover, type Pt } from "@/lib/mapdata";
import { fmt, moneyC } from "@/lib/format";

/** National dot map: one dot per ZIP area, colored by campaign status. */
export function HomeMap({ minKids = 5000 }: { minKids?: number }) {
  const router = useRouter();
  const base = useRef<HTMLCanvasElement>(null), ov = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<(Pt & { c?: Cover }) | null>(null);
  const [err, setErr] = useState("");
  const data = useRef<{ pts: Pt[]; cov: Map<string, Cover>; qt: Quadtree<Pt>; k: number } | null>(null);

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
        ctx.fillStyle = cssVar("--dot");
        for (const p of mapped) if (p.k < minKids && !cov.has(p.z)) ctx.fillRect(p.x! - 0.55, p.y! - 0.55, 1.1, 1.1);
        ctx.fillStyle = cssVar("--navy"); ctx.globalAlpha = 0.3;
        for (const p of mapped) if (p.k >= minKids && !cov.has(p.z)) { ctx.beginPath(); ctx.arc(p.x!, p.y!, 1.05, 0, 6.2832); ctx.fill(); }
        ctx.globalAlpha = 1;
        const gold = cssVar("--gold"), green = cssVar("--green");
        const surf = cssVar("--surface");
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
  }, [minKids]);

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

  return (
    <div className="mapcard">
      <div className="legend">
        <span><i style={{ background: "var(--green)" }} />Campaign area with 5,000+ kids</span>
        <span><i style={{ background: "var(--gold)" }} />Campaign still building to 5,000</span>
        <span><i style={{ background: "var(--navy)", opacity: 0.5 }} />ZIP with 5,000+ kids on its own</span>
        <span><i style={{ background: "var(--dot)" }} />Smaller ZIP (can team up)</span>
      </div>
      <div className="mapstage">
        <canvas ref={base} aria-hidden="true" />
        <canvas ref={ov} className={"ov" + (hover ? " hot" : "")} role="img"
          aria-label="Map of U.S. ZIP code areas. Colored dots show ZIP codes in active campaigns."
          onMouseMove={(e) => { const p = at(e); setHover(p ? { ...p, c: data.current?.cov.get(p.z) } : null); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const p = at(e); if (p) router.push(`/zip/${p.z}`); }} />
        {hover && hover.x !== null && (
          <div className="tip" style={{ left: (hover.x / W) * 100 + "%", top: (hover.y! / H) * 100 + "%" }}>
            <b>{hover.z}</b> · {fmt(hover.k)} kids
            <br />
            {hover.c ? <span className="ok">{hover.c.n} campaign{hover.c.n > 1 ? "s" : ""} · {moneyC(hover.c.raised)} pledged</span>
              : hover.k >= minKids ? "Can qualify on its own" : "Can team up with neighbors"}
          </div>
        )}
      </div>
      {err ? <p className="err" style={{ marginTop: 10 }}>{err}</p> : <p className="maphint">Hover a dot for details. Click to see that ZIP code and its campaigns.</p>}
    </div>
  );
}

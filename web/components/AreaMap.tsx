"use client";
import { useEffect, useRef } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { cssVar, loadPoints, loadStates, sizeCanvas } from "@/lib/mapdata";

const AW = 640, AH = 400;

/** Zoomed map of a set of ZIPs, with neighboring ZIPs as context dots. */
export function AreaMap({ zips, secondary = [], label }: { zips: string[]; secondary?: string[]; label: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const key = zips.join(",") + "|" + secondary.join(",");
  useEffect(() => {
    let alive = true;
    const draw = async () => {
      const [pts, geo] = await Promise.all([loadPoints(), loadStates()]);
      if (!alive || !cv.current) return;
      const main = new Set(zips), sec = new Set(secondary);
      const focus = pts.filter((p) => main.has(p.z) || sec.has(p.z));
      if (!focus.length) return;
      const lats = focus.map((p) => p.lat), lons = focus.map((p) => p.lon);
      const pad = 0.12;
      const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad, minLon = Math.min(...lons) - pad, maxLon = Math.max(...lons) + pad;
      const proj = geoMercator().fitExtent([[24, 24], [AW - 24, AH - 24]], {
        type: "MultiPoint", coordinates: [[minLon, minLat], [maxLon, maxLat]],
      } as GeoJSON.MultiPoint);
      const { ctx } = sizeCanvas(cv.current, AW, AH);
      ctx.clearRect(0, 0, AW, AH);
      const path = geoPath(proj, ctx);
      ctx.beginPath(); path(geo.nation); ctx.fillStyle = cssVar("--land"); ctx.fill();
      ctx.beginPath(); path(geo.borders); ctx.strokeStyle = cssVar("--border-state"); ctx.lineWidth = 1; ctx.stroke();
      const span = Math.max(maxLat - minLat, maxLon - minLon);
      const r = Math.max(4.5, Math.min(10, 4 / Math.max(span, 0.05) ** 0.5));
      ctx.fillStyle = cssVar("--dot");
      for (const p of pts) {
        if (p.lat < minLat - 1 || p.lat > maxLat + 1 || p.lon < minLon - 1 || p.lon > maxLon + 1 || main.has(p.z) || sec.has(p.z)) continue;
        const xy = proj([p.lon, p.lat]); if (!xy) continue;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], r * 0.45, 0, 6.2832); ctx.fill();
      }
      const draw1 = (p: (typeof pts)[number], color: string) => {
        const xy = proj([p.lon, p.lat]); if (!xy) return;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], r + 2, 0, 6.2832); ctx.fillStyle = cssVar("--surface"); ctx.fill();
        ctx.beginPath(); ctx.arc(xy[0], xy[1], r, 0, 6.2832); ctx.fillStyle = color; ctx.fill();
      };
      for (const p of focus) if (sec.has(p.z) && !main.has(p.z)) draw1(p, cssVar("--gold"));
      for (const p of focus) if (main.has(p.z)) draw1(p, cssVar("--green"));
    };
    draw().catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="fundmap"><canvas ref={cv} role="img" aria-label={label} /></div>;
}

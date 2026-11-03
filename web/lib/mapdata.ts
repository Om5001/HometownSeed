"use client";
import { geoAlbersUsa } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, MultiLineString } from "geojson";

export const W = 975, H = 610;
export const albers = geoAlbersUsa().scale(1300).translate([487.5, 305]);
export type Pt = { z: string; lat: number; lon: number; k: number; x: number | null; y: number | null };
export type Cover = { z: string; s: 1 | 2; n: number; raised: number };

let ptsP: Promise<Pt[]> | null = null;
let geoP: Promise<{ nation: Feature; borders: MultiLineString }> | null = null;

export function loadPoints(): Promise<Pt[]> {
  ptsP ??= fetch("/api/map/points").then((r) => {
    if (!r.ok) throw new Error("map points " + r.status);
    return r.text();
  }).then((t) => t.split(";").filter(Boolean).map((row) => {
    const [z, la, lo, k] = row.split(",");
    const lat = +la, lon = +lo, xy = albers([lon, lat]);
    return { z, lat, lon, k: +k, x: xy ? xy[0] : null, y: xy ? xy[1] : null };
  }));
  ptsP.catch(() => { ptsP = null; });
  return ptsP;
}

export function loadStates() {
  geoP ??= fetch("/us-states.json").then((r) => r.json()).then((t: Topology) => {
    const objs = t.objects as Record<string, GeometryCollection>;
    return {
      nation: feature(t, objs.nation) as unknown as Feature,
      borders: mesh(t, objs.states, (a, b) => a !== b) as MultiLineString,
    };
  });
  return geoP;
}

export async function loadCoverage(): Promise<Map<string, Cover>> {
  const r = await fetch("/api/map/coverage", { cache: "no-store" });
  const rows: Cover[] = r.ok ? await r.json() : [];
  return new Map(rows.map((c) => [c.z, c]));
}

export const cssVar = (name: string) =>
  typeof window === "undefined" ? "#999" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function sizeCanvas(cv: HTMLCanvasElement, w0: number, h0: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || cv.parentElement?.clientWidth || w0;
  const h = (w * h0) / w0;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform((dpr * w) / w0, 0, 0, (dpr * w) / w0, 0, 0);
  return { ctx, k: w / w0 };
}

/** TEMPORARY (demo data): estimated pledge dollars by ZIP. byZip: zcta -> cents per pledge index. */
export type PledgeMap = {
  pledges: { id: string; donor: string; per_child_cents: number; total_cents: number; kids: number; zips: number; map_note: string | null }[];
  unmapped: { donor: string; note: string | null }[];
  byZip: Map<string, number[]>;
};
let pmP: Promise<PledgeMap> | null = null;
export function loadPledgeMap(): Promise<PledgeMap> {
  pmP ??= fetch("/api/demo/pledge-map").then((r) => {
    if (!r.ok) throw new Error("pledge map " + r.status);
    return r.json();
  }).then((d: { pledges: PledgeMap["pledges"]; unmapped: PledgeMap["unmapped"]; rows: string }) => {
    const byZip = new Map<string, number[]>();
    for (const row of d.rows.split(";")) {
      if (!row) continue;
      const [z, ...parts] = row.split(",");
      const a: number[] = [];
      for (const p of parts) { const [i, c] = p.split(":"); a[+i] = +c; }
      byZip.set(z, a);
    }
    return { pledges: d.pledges, unmapped: d.unmapped, byZip };
  });
  pmP.catch(() => { pmP = null; });
  return pmP;
}

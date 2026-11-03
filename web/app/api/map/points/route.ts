import { gzipSync } from "node:zlib";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";

/**
 * Every ZIP area as compact text: "zcta,lat,lon,kids;..." (~33,000 areas).
 * Built once per server process (Census data changes monthly at most) and sent gzipped,
 * which cuts it from ~800 KB to ~250 KB.
 */
const g = globalThis as unknown as { __hsPoints?: { at: number; raw: string; gz: Buffer } };
const TTL = 6 * 3600_000;

export const GET = handle(async (req: Request) => {
  if (!g.__hsPoints || Date.now() - g.__hsPoints.at > TTL) {
    const rows = await db()<{ z: string; lat: number; lon: number; k: number }[]>`
      select zcta::text as z, round(lat::numeric, 3)::float8 as lat, round(lon::numeric, 3)::float8 as lon, kids_u18::int as k
      from zcta_stats where lat is not null`;
    const raw = rows.map((r) => `${r.z},${r.lat},${r.lon},${r.k}`).join(";");
    g.__hsPoints = { at: Date.now(), raw, gz: gzipSync(raw, { level: 9 }) };
  }
  const p = g.__hsPoints;
  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8", vary: "accept-encoding",
    "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  };
  if (/\bgzip\b/.test(req.headers.get("accept-encoding") || "")) {
    return new Response(new Uint8Array(p.gz), { headers: { ...headers, "content-encoding": "gzip" } });
  }
  return new Response(p.raw, { headers });
});

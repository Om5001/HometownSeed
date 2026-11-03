import { gzipSync } from "node:zlib";
import { handle } from "@/lib/http";
import { pledgeMap } from "@/lib/demo";

/** TEMPORARY (demo data): estimated pledge dollars by ZIP for the map. Cached for an hour, sent gzipped. */
const g = globalThis as unknown as { __hsPledgeMap?: { at: number; raw: string; gz: Buffer } };

export const GET = handle(async (req: Request) => {
  if (!g.__hsPledgeMap || Date.now() - g.__hsPledgeMap.at > 3600_000) {
    const raw = JSON.stringify(await pledgeMap());
    g.__hsPledgeMap = { at: Date.now(), raw, gz: gzipSync(raw) };
  }
  const p = g.__hsPledgeMap;
  const headers: Record<string, string> = { "content-type": "application/json", vary: "accept-encoding", "cache-control": "public, max-age=600" };
  if (/\bgzip\b/.test(req.headers.get("accept-encoding") || "")) return new Response(new Uint8Array(p.gz), { headers: { ...headers, "content-encoding": "gzip" } });
  return new Response(p.raw, { headers });
});

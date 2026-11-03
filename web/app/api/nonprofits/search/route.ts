import { handle, ok } from "@/lib/http";
import { searchOrgs } from "@/lib/nonprofits";

/** Search 501(c)(3)s by name and state (IRS file if loaded, else ProPublica). */
export const GET = handle(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  return ok(await searchOrgs(p.get("q") || "", p.get("state") || ""));
});

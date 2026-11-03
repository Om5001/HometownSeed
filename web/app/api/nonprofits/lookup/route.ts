import { handle, ok, requireUser } from "@/lib/http";
import { lookupEin } from "@/lib/nonprofits";

/** Look up an organization by EIN (IRS file if loaded, else ProPublica). */
export const GET = handle(async (req: Request) => {
  await requireUser();
  const org = await lookupEin(new URL(req.url).searchParams.get("ein") || "");
  return ok({ org });
});

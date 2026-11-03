import { notifySigners, setDonor } from "@/lib/coalition";
import { handle, ok, requireUser, siteUrl, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";

/** Choose the coalition's Qualified Donor: a member's nonprofit, or Hometown Seed's (null). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const b = await readJson(req);
  const r = await setDonor(user, id, b.nonprofitId ? String(b.nonprofitId) : null);
  await audit(user.id, "coalition.donor", "pool", id, { nonprofit: b.nonprofitId ?? null });
  if (r.newAgreement) await notifySigners(id, siteUrl(req));
  return ok(r);
});

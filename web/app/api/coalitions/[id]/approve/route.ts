import { approveDocument } from "@/lib/coalition";
import { fail, handle, ok, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";

/** Sign the coalition agreement for one of your campaigns (step 3). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (b.agree !== true) return fail("Check the box to confirm you've read the agreement.");
  const r = await approveDocument(user, String(b.documentId || ""), String(b.campaign || ""), String(b.name || ""));
  await audit(user.id, "coalition.approve", "pool", id, { document: b.documentId, campaign: b.campaign });
  return ok(r);
});

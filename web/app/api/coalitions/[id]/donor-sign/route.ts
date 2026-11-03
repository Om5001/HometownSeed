import { handle, ok, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";
import { signDonorSection } from "@/lib/treasury";

/** The member nonprofit's authorized representative signs Section 4 of the application. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const r = await signDonorSection(user, id, await req.json().catch(() => ({})));
  await audit(user.id, "treasury.donor_sign", "pool", id);
  return ok(r);
});

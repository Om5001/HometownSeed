import { signDocument } from "@/lib/coalition";
import { fail, handle, ok, requireUser, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";

/** Sign the coalition agreement. Everyone named in it signs (or leaves). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.agree !== true) return fail("Check the box to confirm you've read the agreement.");
  const r = await signDocument(user, String(b.documentId || ""), String(b.name || ""));
  await audit(user.id, "coalition.sign", "pool", id, { document: b.documentId });
  return ok(r);
});

import { fail, handle, ok, requireUser, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";
import { mockTreasury } from "@/lib/treasury";

/** Simulate Treasury's decision or distribution (only while MOCK_TREASURY is on). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const { action } = await readJson(req);
  if (!["approve", "reject", "distribute"].includes(action)) return fail("Unknown action.");
  const r = await mockTreasury(user, id, action);
  await audit(user.id, "treasury.mock." + action, "pool", id, r);
  return ok(r);
});

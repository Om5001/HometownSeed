import { handle, ok, requireUser, readJson } from "@/lib/http";
import { audit } from "@/lib/queries";
import { updateRecognition } from "@/lib/treasury";

/** Change Section 3 (public recognition) of the application before it's sent. Everything else comes from the agreement. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const r = await updateRecognition(user, id, await readJson(req));
  await audit(user.id, "treasury.recognition", "pool", id, r);
  return ok(r);
});

import { handle, ok, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";
import { submitApplication } from "@/lib/treasury";

/** Send the application to Treasury (mock mode: recorded in the outbox only). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser({ verified: true });
  const { id } = await ctx.params;
  const r = await submitApplication(user, id);
  await audit(user.id, "treasury.submit", "pool", id, r);
  return ok(r);
});

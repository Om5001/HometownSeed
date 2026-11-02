import { db } from "@/lib/db";
import { fail, handle, requireUser } from "@/lib/http";
import { getSubmission, renderApplicationPdf } from "@/lib/treasury";

/** The filled application as a PDF (people in the coalition only). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const [m] = await db()`select 1 from coalition_people(${id}) where user_id = ${user.id}`;
  if (!m) return fail("Only people in this coalition can download the application.", 403);
  const s = await getSubmission(id);
  if (!s?.application || !s.application_hash) return fail("The application hasn't been filled in yet.", 404);
  const bytes = await renderApplicationPdf(s.application, s.application_hash, s.status);
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Trump-Accounts-Contribution-Application.pdf"`, "cache-control": "private, no-store" },
  });
});

import { db } from "@/lib/db";
import { fail, handle, HttpError, ok, requireUser } from "@/lib/http";
import { memberRole } from "@/lib/queries";

/** Organizers get the invite link; optional emails are recorded for a later email integration. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser();
  const { slug } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const sql = db();
  const [c] = await sql<{ id: string; invite_code: string }[]>`select id, invite_code from campaigns where slug = ${slug}`;
  if (!c) return fail("Campaign not found.", 404);
  if (!(await memberRole(c.id, user.id))) throw new HttpError(403, "Only organizers can invite.");
  const emails = (Array.isArray(b.emails) ? b.emails : [])
    .map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 25);
  for (const e of emails) await sql`insert into invites (campaign_id, email, created_by) values (${c.id}, ${e}, ${user.id})`;
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return ok({ link: `${base}/join/${c.invite_code}`, recorded: emails.length });
});

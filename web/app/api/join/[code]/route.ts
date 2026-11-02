import { db } from "@/lib/db";
import { fail, handle, ok, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";

/** Accept a friend invite: join the campaign as an organizer. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const sql = db();
  const [c] = await sql<{ id: string; slug: string }[]>`select id, slug from campaigns where invite_code = ${code} and status = 'active'`;
  if (!c) return fail("This invite link isn't valid anymore.", 404);
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${c.id}, ${user.id}, 'organizer') on conflict do nothing`;
  await sql`update invites set accepted_by = ${user.id}, accepted_at = now()
            where campaign_id = ${c.id} and lower(email) = lower(${user.email}) and accepted_by is null`;
  await audit(user.id, "invite.accept", "campaign", c.slug);
  return ok({ slug: c.slug });
});

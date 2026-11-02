import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, handle, int, ok } from "@/lib/http";
import { audit } from "@/lib/queries";
import { startPayment } from "@/lib/payments";

/** Record a pledge. In the prototype no money moves (status 'pledged'). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const user = await getUser();
  const amountCents = int(b.amountCents, 0, 100_000_000_00, 0);
  if (amountCents < 500) return fail("The minimum gift is $5.");
  const name = String(b.name || user?.display_name || "").trim().slice(0, 80);
  const email = String(b.email || user?.email || "").trim().slice(0, 120) || null;
  if (!name) return fail("Enter your name (you can still give anonymously).");
  const message = String(b.message || "").trim().slice(0, 280) || null;
  const anonymous = !!b.anonymous;
  const feeCover = b.coverFees ? Math.round(amountCents * 0.03) : 0;

  const sql = db();
  const [c] = await sql<{ id: string; status: string }[]>`select id, status from campaigns where slug = ${slug}`;
  if (!c) return fail("Campaign not found.", 404);
  if (c.status !== "active") return fail("This campaign is no longer taking gifts.");

  const [p] = await sql<{ id: string }[]>`
    insert into pledges (campaign_id, user_id, donor_name, donor_email, is_anonymous, amount_cents, fee_cover_cents, message)
    values (${c.id}, ${user?.id ?? null}, ${name}, ${email}, ${anonymous}, ${amountCents}, ${feeCover}, ${message})
    returning id`;
  const payment = await startPayment({ pledgeId: p.id, amountCents: amountCents + feeCover, campaignSlug: slug, email });
  await audit(user?.id ?? null, "pledge.create", "pledge", p.id, { slug, amountCents });
  return ok({ id: p.id, payment }, { status: 201 });
});

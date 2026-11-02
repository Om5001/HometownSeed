import { db } from "@/lib/db";
import { cleanZips, fail, handle, int, ok, requireUser } from "@/lib/http";
import { slugify } from "@/lib/format";
import { areaStats, audit, listCampaigns } from "@/lib/queries";

export const GET = handle(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  return ok(await listCampaigns({ q: p.get("q") || undefined, zcta: p.get("zip") || undefined, limit: int(p.get("limit"), 1, 60, 24) }));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser({ verified: true });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 80);
  const description = String(b.description || "").trim().slice(0, 500) || null;
  const zips = cleanZips(b.zips);
  const suggested = new Set(cleanZips(b.suggestedZips));
  const goalCents = int(b.goalCents, 0, 1e12, 0);
  const minAge = int(b.minAge, 0, 17, 0), maxAge = int(b.maxAge, minAge, 17, 17);
  const mode = ["solo", "match", "friends"].includes(b.mode) ? b.mode : "match";

  if (name.length < 3) return fail("Give your campaign a name (3+ characters).");
  if (!zips.length) return fail("Add at least one ZIP code.");
  if (goalCents < 10000) return fail("Set a goal of at least $100.");
  const area = await areaStats(zips, minAge, maxAge);
  if (!area || !area.zip_count) return fail("We couldn't find those ZIP codes in Census data.");

  const sql = db();
  const slug = await sql.begin(async (tx) => {
    const base = slugify(name);
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from campaigns where slug = ${base} or slug like ${base + "-%"}`;
    const slug = n ? `${base}-${n + 1}` : base;
    const [c] = await tx<{ id: string }[]>`
      insert into campaigns (slug, name, description, owner_id, mode, goal_cents, min_age, max_age)
      values (${slug}, ${name}, ${description}, ${user.id}, ${mode}, ${goalCents}, ${minAge}, ${maxAge})
      returning id`;
    for (const z of area.zctas) {
      await tx`insert into campaign_zips (campaign_id, zcta, added_by) values (${c.id}, ${z}, ${suggested.has(z) ? "suggested" : "organizer"})`;
    }
    await tx`insert into campaign_members (campaign_id, user_id, role) values (${c.id}, ${user.id}, 'owner')`;
    return slug;
  });
  await audit(user.id, "campaign.create", "campaign", slug, { zips: area.zctas, goalCents, mode, minAge, maxAge });
  return ok({ slug, missing: area.missing }, { status: 201 });
});

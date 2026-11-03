import { db } from "@/lib/db";
import { cleanZips, fail, handle, int, ok, requireUser, readJson } from "@/lib/http";
import { slugify } from "@/lib/format";
import { areaStats, audit, listCampaigns } from "@/lib/queries";

export const GET = handle(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  return ok(await listCampaigns({ q: p.get("q") || undefined, zcta: p.get("zip") || undefined, limit: int(p.get("limit"), 1, 60, 24) }));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser({ verified: true });
  const b = await readJson(req);
  const name = String(b.name || "").trim().slice(0, 80);
  const description = String(b.description || "").trim().slice(0, 500) || null;
  const zips = cleanZips(b.zips);
  const suggested = new Set(cleanZips(b.suggestedZips));
  const goalType = ["total", "per_child", "open"].includes(b.goalType) ? b.goalType : "total";
  const goalCents = goalType === "total" ? int(b.goalCents, 0, 1e12, 0) : null;
  const goalPerChild = goalType === "per_child" ? int(b.goalPerChildCents, 0, 1e9, 0) : null;
  const minAge = int(b.minAge, 0, 17, 0), maxAge = int(b.maxAge, minAge, 17, 17);
  // Matching and friend invites can both be on; both off = run on my own.
  const matching = b.openToMatching === undefined ? b.mode !== "solo" && b.mode !== "friends" : !!b.openToMatching;
  const friends = b.inviteFriends === undefined ? b.mode === "friends" : !!b.inviteFriends;
  const mode = matching ? "match" : friends ? "friends" : "solo";

  if (name.length < 3) return fail("Give your campaign a name (3+ characters).");
  if (!zips.length) return fail("Add at least one ZIP code.");
  if (goalType === "total" && (goalCents ?? 0) < 10000) return fail("Set a goal of at least $100, or pick another goal type.");
  if (goalType === "per_child" && (goalPerChild ?? 0) < 1) return fail("Set an amount per child.");
  const area = await areaStats(zips, minAge, maxAge);
  if (!area || !area.zip_count) return fail("We couldn't find those ZIP codes in Census data.");

  const sql = db();
  const slug = await sql.begin(async (tx) => {
    const base = slugify(name);
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from campaigns where slug = ${base} or slug like ${base + "-%"}`;
    const slug = n ? `${base}-${n + 1}` : base;
    const [c] = await tx<{ id: string }[]>`
      insert into campaigns (slug, name, description, owner_id, mode, goal_type, goal_cents, goal_per_child_cents,
                             open_to_matching, invite_friends, min_age, max_age)
      values (${slug}, ${name}, ${description}, ${user.id}, ${mode}, ${goalType}, ${goalCents}, ${goalPerChild},
              ${matching}, ${friends}, ${minAge}, ${maxAge})
      returning id`;
    for (const z of area.zctas) {
      await tx`insert into campaign_zips (campaign_id, zcta, added_by) values (${c.id}, ${z}, ${suggested.has(z) ? "suggested" : "organizer"})`;
    }
    await tx`insert into campaign_members (campaign_id, user_id, role) values (${c.id}, ${user.id}, 'owner')`;
    // First campaign also sets up the giving profile, so matching works right away.
    await tx`insert into giving_profiles (user_id, target_zips, min_age, max_age, per_child_cents, anchor_lat, anchor_lon)
             values (${user.id}, ${area.zctas}::char(5)[], ${minAge}, ${maxAge},
                     ${goalPerChild ?? (goalCents && area.kids_in_class ? Math.round(goalCents / area.kids_in_class) : null)},
                     ${area.lat}, ${area.lon})
             on conflict (user_id) do nothing`;
    return slug;
  });
  await audit(user.id, "campaign.create", "campaign", slug, { zips: area.zctas, goalType, goalCents, goalPerChild, matching, friends, minAge, maxAge });
  return ok({ slug, missing: area.missing }, { status: 201 });
});

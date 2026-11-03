import { cleanZips, fail, handle, int, ok, requireUser, readJson } from "@/lib/http";
import { getProfile, saveProfile } from "@/lib/queries";

export const GET = handle(async () => {
  const user = await requireUser();
  return ok({ profile: await getProfile(user.id) });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson(req);
  const home = cleanZips([b.home_zip])[0] ?? null;
  const gifts = (Array.isArray(b.gift_types) ? b.gift_types : []).filter((g: string) => ["cash", "stock", "daf"].includes(g));
  if (!gifts.length) return fail("Pick at least one way you'd like to give.");
  const minAge = int(b.min_age, 0, 17, 0), maxAge = int(b.max_age, minAge, 17, 17);
  const cents = (v: unknown) => (v === null || v === undefined || v === "" ? null : int(v, 0, 1e13, 0));
  await saveProfile(user.id, {
    home_zip: home,
    radius_miles: int(b.radius_miles, 1, 3000, 25),
    target_zips: cleanZips(b.target_zips).slice(0, 50),
    gift_types: gifts,
    budget_cents: cents(b.budget_cents),
    per_child_cents: cents(b.per_child_cents),
    min_age: minAge, max_age: maxAge,
    income_focus: ["any", "below_threshold", "lowest"].includes(b.income_focus) ? b.income_focus : "any",
    open_to_match: b.open_to_match !== false,
    bio: String(b.bio || "").trim().slice(0, 280) || null,
  });
  return ok({ ok: true });
});

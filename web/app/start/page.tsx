import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProfile, getRules, zipDetails } from "@/lib/queries";
import { Builder } from "@/components/Builder";

export const dynamic = "force-dynamic";

export default async function StartPage({ searchParams }: { searchParams: Promise<{ zip?: string; with?: string }> }) {
  const sp = await searchParams;
  const user = await requirePageUser("/start" + (sp.zip ? `?zip=${sp.zip}` : sp.with ? `?with=${sp.with}` : ""));
  const [rules, profile] = await Promise.all([getRules(), getProfile(user.id)]);

  // Starting together with a mutual match: combine both people's places.
  let partner: { id: string; name: string; email: string } | null = null;
  let zips: string[] = [];
  if (sp.with && /^[0-9a-f-]{36}$/.test(sp.with)) {
    const [p] = await db()<{ id: string; name: string; email: string; target_zips: string[] | null }[]>`
      select u.id, u.display_name as name, u.email, g.target_zips::text[] as target_zips
      from v_connections c join app_users u on u.id = c.other_id left join giving_profiles g on g.user_id = u.id
      where c.user_id = ${user.id} and c.other_id = ${sp.with}`;
    if (p) { partner = { id: p.id, name: p.name, email: p.email }; zips = [...(profile?.target_zips ?? []), ...(p.target_zips ?? [])]; }
  }
  if (sp.zip && /^\d{5}$/.test(sp.zip)) zips = [sp.zip];
  else if (!zips.length) zips = profile?.target_zips ?? [];
  const pre = await zipDetails(Array.from(new Set(zips)).slice(0, 50));

  return (
    <main className="wrap">
      <div className="dash-head builder" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">{partner ? `Start a campaign with ${partner.name}` : "Start a campaign"}</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 900, marginTop: 8 }}>Pick the places you care about</h1>
        <p className="lede2">{partner ? `We added both of your places. ${partner.name.split(" ")[0]} gets an invite to co-organize when you publish.` : "Set a goal, then we'll show you who's already raising for the same kids or at the same amount per child."}</p>
      </div>
      <Builder rules={rules} initial={pre} partner={partner}
        initialAge={profile ? { min: profile.min_age, max: profile.max_age } : undefined} />
    </main>
  );
}

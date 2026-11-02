import { requirePageUser } from "@/lib/auth";
import { getProfile, getRules, zipDetails } from "@/lib/queries";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requirePageUser("/profile");
  const { welcome } = await searchParams;
  const [profile, rules] = await Promise.all([getProfile(user.id), getRules()]);
  const zips = await zipDetails([...(profile?.target_zips ?? []), ...(profile?.home_zip ? [profile.home_zip] : [])]);
  return (
    <main className="wrap">
      <div className="dash-head builder" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">{welcome ? "Welcome, " + user.display_name.split(" ")[0] : "Your giving profile"}</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 900, marginTop: 8 }}>What do you want to fund?</h1>
        <p className="lede2">We use this to match you with campaigns and people giving to the same places, the same kids, at a similar amount per child.</p>
      </div>
      <ProfileForm initial={profile} zips={zips} incomeLine={rules.income_threshold} welcome={!!welcome} />
    </main>
  );
}

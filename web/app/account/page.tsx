import { requirePageUser } from "@/lib/auth";
import { getProfile, getRules, zipDetails } from "@/lib/queries";
import { AccountForms } from "@/components/AccountForms";
import { ProfileForm } from "@/components/ProfileForm";
import { NonprofitForm } from "@/components/NonprofitForm";
import { NonprofitBadge } from "@/components/NonprofitBadge";
import { myNonprofits } from "@/lib/nonprofits";

export const dynamic = "force-dynamic";

/** One page for everything about you: giving profile (used for matching) + sign-in and account settings. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requirePageUser("/account");
  const { welcome } = await searchParams;
  const [profile, rules, nps] = await Promise.all([getProfile(user.id), getRules(), myNonprofits(user.id)]);
  const zips = await zipDetails([...(profile?.target_zips ?? []), ...(profile?.home_zip ? [profile.home_zip] : [])]);
  return (
    <main className="wrap">
      <div className="dash-head builder" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">{welcome ? "Welcome, " + user.display_name.split(" ")[0] : "Your profile"}</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 900, marginTop: 8 }}>{user.display_name}</h1>
        {(nps.length > 0 || user.has_nonprofit) && <p style={{ marginTop: 6 }}><NonprofitBadge name={nps[0]?.name} verified={nps.length > 0 && nps[0].verified_source !== "self"} /></p>}
        <p className="lede2">{user.email} · {user.email_verified ? "Email confirmed" : "Email not confirmed yet"}</p>
        {welcome && user.has_nonprofit && !nps.length && <p className="notice" style={{ marginTop: 12 }}><b>You said you represent a 501(c)(3).</b> <a href="#nonprofit">Add it with its EIN</a> so your coalitions can use it.</p>}
        <nav className="subnav" aria-label="Profile sections">
          <a href="#giving">Giving profile</a>
          <a href="#nonprofit">Nonprofit</a>
          <a href="#settings">Account settings</a>
        </nav>
      </div>

      <section id="giving" className="acct-sec">
        <div className="builder"><h2>What do you want to fund?</h2>
        <p className="lede2">We use this to match you with campaigns and people giving to the same places, the same kids, at a similar amount per child.</p></div>
        <ProfileForm initial={profile} zips={zips} incomeLine={rules.income_threshold} welcome={!!welcome} />
      </section>

      <section id="nonprofit" className="acct-sec">
        <div className="builder"><h2>Nonprofit</h2>
        <p className="lede2">If you represent a 501(c)(3), it can apply to Treasury for your coalitions.</p></div>
        <NonprofitForm hasNonprofit={user.has_nonprofit} mine={nps} verifiedEmail={user.email_verified} />
      </section>

      <section id="settings" className="acct-sec">
        <div className="builder"><h2>Account settings</h2>
        <p className="lede2">Name, password, sign-out and deletion.</p></div>
        <AccountForms name={user.display_name} />
      </section>
    </main>
  );
}

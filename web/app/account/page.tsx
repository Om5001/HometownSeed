import { requirePageUser } from "@/lib/auth";
import { AccountForms } from "@/components/AccountForms";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser("/account");
  return (
    <main className="wrap">
      <div className="dash-head builder" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">Account</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 900, marginTop: 8 }}>Your account</h1>
        <p className="lede2">{user.email} · {user.email_verified ? "Email confirmed" : "Email not confirmed yet"}</p>
      </div>
      <AccountForms name={user.display_name} />
    </main>
  );
}

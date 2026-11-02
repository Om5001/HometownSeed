import { getUser } from "@/lib/auth";
import { getRules, zipDetails } from "@/lib/queries";
import { Builder } from "@/components/Builder";

export const dynamic = "force-dynamic";

export default async function StartPage({ searchParams }: { searchParams: Promise<{ zip?: string }> }) {
  const { zip } = await searchParams;
  const [user, rules, pre] = await Promise.all([
    getUser(), getRules(), zip && /^\d{5}$/.test(zip) ? zipDetails([zip]) : Promise.resolve([]),
  ]);
  return (
    <main className="wrap">
      <div className="dash-head builder" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">Start a campaign</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 900, marginTop: 8 }}>Pick the places you care about</h1>
        <p className="lede2">Set a goal, then we&apos;ll show you who&apos;s already raising for the same kids or at the same amount per child.</p>
      </div>
      <Builder user={user} rules={rules} initial={pre} />
    </main>
  );
}

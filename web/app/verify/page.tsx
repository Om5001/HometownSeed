import Link from "next/link";
import { verifyEmailToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmailToken(token) : false;
  return (
    <main className="wrap"><section className="panel signin-card stack">
      {ok ? (<>
        <div className="thanks"><div className="ring">✓</div><h3>Email confirmed</h3><p>You can now start campaigns, pledge, and match with other givers.</p></div>
        <Link className="btn btn-green" href="/match">Find your matches</Link>
      </>) : (<>
        <h2>That link didn&apos;t work</h2>
        <p className="lede2">It may have expired (links last 24 hours) or already been used. Sign in and use “Resend email” in the banner at the top.</p>
        <Link className="btn btn-green" href="/signin">Sign in</Link>
      </>)}
    </section></main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { JoinButton } from "@/components/JoinButton";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [c] = await db()<{ slug: string; name: string; owner: string }[]>`
    select c.slug, c.name, u.display_name as owner from campaigns c join app_users u on u.id = c.owner_id
    where c.invite_code = ${code} and c.status = 'active'`;
  if (!c) notFound();
  const user = await getUser();
  return (
    <main className="wrap">
      <section className="panel signin-card stack">
        <p className="eyebrow">You&apos;re invited</p>
        <h2>{c.owner} invited you to help organize {c.name}</h2>
        <p className="lede2">Co-organizers can invite more friends, request to pool with other campaigns, and accept pool requests.</p>
        {user ? <JoinButton code={code} /> : <Link className="btn btn-green" href={`/signin?next=/join/${code}`}>Sign in to join</Link>}
        <Link className="small" href={`/c/${c.slug}`}>Just look at the campaign</Link>
      </section>
    </main>
  );
}

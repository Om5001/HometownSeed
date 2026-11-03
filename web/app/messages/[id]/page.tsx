import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { getThread, isBlocked, listConversations } from "@/lib/messages";
import { ConversationList } from "@/components/Inbox";
import { Thread } from "@/components/Messaging";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePageUser(`/messages/${id}`);
  let thread;
  try { thread = await getThread(user, id); }
  catch (e) { if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const convs = await listConversations(user);   // after getThread, so this one shows as read
  const c = convs.find((x) => x.id === id);
  const blocked = c?.other_id ? await isBlocked(user.id, c.other_id) : false;
  return (
    <main className="wrap section">
      <div className="section-head"><div><h2>Messages</h2></div></div>
      <div className="inbox has-thread">
        <ConversationList convs={convs} current={id} />
        <section className="panel">
          <div className="panel-head"><div>
            <Link className="back small" href="/messages">← All conversations</Link>
            <h2 style={{ marginTop: 6 }}>{c?.title ?? "Conversation"}</h2>
            {thread.kind === "coalition" && thread.pool_id && <p className="small muted">Everyone in the coalition can read and write here. <Link href={`/coalitions/${thread.pool_id}`}>Open the agreement</Link></p>}
            {c?.subtitle && c.campaign_slug && <p className="small muted"><Link href={`/c/${c.campaign_slug}`}>{c.subtitle}</Link></p>}
          </div></div>
          <Thread id={id} initial={thread.messages} group={thread.kind === "coalition"} otherId={c?.other_id ?? null} blocked={blocked} />
        </section>
      </div>
    </main>
  );
}

import { requirePageUser } from "@/lib/auth";
import { listConversations } from "@/lib/messages";
import { ConversationList } from "@/components/Inbox";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requirePageUser("/messages");
  const convs = await listConversations(user);
  return (
    <main className="wrap section">
      <div className="section-head"><div><h2>Messages</h2><p className="muted">Talk with other givers, campaign organizers, nonprofits, and your coalitions. Email addresses stay private.</p></div></div>
      <div className="inbox">
        <ConversationList convs={convs} />
        <section className="panel"><p className="empty">{convs.length ? "Pick a conversation." : "When you message someone, the conversation shows up here."}</p></section>
      </div>
    </main>
  );
}

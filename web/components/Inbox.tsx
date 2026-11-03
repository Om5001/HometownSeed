import Link from "next/link";
import type { ConversationRow } from "@/lib/messages";
import { ago, initials } from "@/lib/format";

/** Conversation list (left side of the Messages page). */
export function ConversationList({ convs, current }: { convs: ConversationRow[]; current?: string }) {
  if (!convs.length) return (
    <div className="convs"><p className="empty" style={{ padding: 16 }}>No conversations yet. Message someone from <Link href="/match">Find partners</Link>, a campaign page, or the <Link href="/nonprofits">Nonprofits</Link> page.</p></div>
  );
  return (
    <nav className="convs" aria-label="Conversations">
      {convs.map((c) => (
        <Link key={c.id} href={`/messages/${c.id}`} className={"conv" + (c.id === current ? " on" : "") + (c.unread ? " unread" : "")} aria-current={c.id === current ? "page" : undefined}>
          <span className={"avatar " + (c.kind === "coalition" ? "av-none" : "av-friend")}>{c.kind === "coalition" ? "👥" : initials(c.title)}</span>
          <span style={{ minWidth: 0 }}><b>{c.title}</b>
            <small className="muted">{c.last_body ? `${c.last_sender ? c.last_sender.split(" ")[0] + ": " : ""}${c.last_body}` : c.subtitle ?? "No messages yet"}</small></span>
          <span style={{ textAlign: "right" }}><small className="muted">{ago(c.last_message_at)}</small>{c.unread > 0 && <span className="badge-n">{c.unread}</span>}</span>
        </Link>
      ))}
    </nav>
  );
}

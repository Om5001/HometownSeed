"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/refresh";

const BG = { "x-hs-background": "1" };   // polling: don't show the busy cursor
const time = (iso: string) => {
  const d = new Date(iso), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

/** "Message" button that opens a small composer, sends, and opens the conversation. */
export function MessageButton({ to, campaign, name, label = "Message", signedIn = true, className = "btn btn-ghost btn-sm" }:
  { to?: string; campaign?: string; name: string; label?: string; signedIn?: boolean; className?: string }) {
  const router = useRouter(); const refresh = useRefresh();
  const [open, setOpen] = useState(false); const [body, setBody] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (!signedIn) return <Link className={className} href={`/signin?next=${encodeURIComponent(typeof window === "undefined" ? "/" : location.pathname)}`}>{label}</Link>;
  if (!open) return <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="composer pop" onClick={(e) => e.stopPropagation()}>
      <textarea className="input" rows={3} autoFocus maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={`Write to ${name}. Say who you are and what you'd like to do together.`} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn btn-green btn-sm" disabled={busy || !body.trim()} onClick={async () => {
          setBusy(true); setErr("");
          const r = await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, campaign, body }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { setErr(d.error || "Couldn't send."); setBusy(false); return; }
          router.push(`/messages/${d.id}`);
        }}>{busy ? "Sending…" : "Send"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setErr(""); }}>Cancel</button>
        <span className="small muted">Your email stays private.</span>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

type Msg = { id: number; sender_name: string; body: string; created_at: string; mine: boolean };

/** A conversation: messages plus a reply box. Checks for new messages every few seconds. */
export function Thread({ id, initial, group, otherId, blocked: blocked0 }: { id: string; initial: Msg[]; group: boolean; otherId: string | null; blocked: boolean }) {
  const router = useRouter(); const refresh = useRefresh();
  const [msgs, setMsgs] = useState(initial); const [body, setBody] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(blocked0);
  const end = useRef<HTMLDivElement>(null);
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;

  const poll = useCallback(async () => {
    const r = await fetch(`/api/messages/${id}?after=${lastId}`, { headers: BG, cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    if (d.messages.length) setMsgs((m) => [...m, ...d.messages.filter((x: Msg) => !m.some((y) => y.id === x.id))]);
  }, [id, lastId]);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 6000); return () => clearInterval(t); }, [poll]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/messages/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't send.");
    setBody(""); await poll(); refresh();
  };

  return (
    <div className="thread">
      <div className="msgs" aria-live="polite">
        {msgs.length ? msgs.map((m, i) => {
          const showName = group && !m.mine && (i === 0 || msgs[i - 1].sender_name !== m.sender_name);
          return (
            <div key={m.id} className={"msg" + (m.mine ? " mine" : "")}>
              {showName && <span className="who">{m.sender_name}</span>}
              <div className="bubble">{m.body}</div>
              <span className="when">{time(m.created_at)}</span>
            </div>
          );
        }) : <p className="empty">No messages yet. Say hello.</p>}
        <div ref={end} />
      </div>
      {blocked ? <p className="small muted">You blocked this person. Unblock them to message again.</p> : (
        <div className="composer">
          <textarea className="input" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Message" />
          <button className="btn btn-green btn-sm" disabled={busy || !body.trim()} onClick={send}>{busy ? "…" : "Send"}</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {!group && otherId && (
        <p className="small muted" style={{ marginTop: 8 }}>Enter sends; Shift+Enter adds a line. ·{" "}
          <button className="linkish" onClick={async () => {
            const r = await fetch(`/api/users/${otherId}/block`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ block: !blocked }) });
            if (r.ok) setBlocked(!blocked);
          }}>{blocked ? "Unblock" : "Block this person"}</button></p>
      )}
    </div>
  );
}

/** Unread count next to "Messages" in the menu (checks every 30 seconds). */
export function UnreadBadge({ initial }: { initial: number }) {
  const [n, setN] = useState(initial);
  useEffect(() => { setN(initial); }, [initial]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/messages/unread", { headers: BG, cache: "no-store" }).catch(() => null);
      if (r?.ok) setN((await r.json()).unread);
    }, 30000);
    return () => clearInterval(t);
  }, []);
  return n > 0 ? <span className="badge-n" aria-label={`${n} unread`}>{n > 99 ? "99+" : n}</span> : null;
}

/** Opens (creating if needed) the coalition's group chat. */
export function CoalitionChatButton({ poolId }: { poolId: string }) {
  const router = useRouter(); const refresh = useRefresh(); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  return (<>
    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await fetch(`/api/coalitions/${poolId}/chat`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error); setBusy(false); return; }
      router.push(`/messages/${d.id}`);
    }}>{busy ? "Opening…" : "Coalition chat"}</button>
    {err && <span className="err">{err}</span>}
  </>);
}

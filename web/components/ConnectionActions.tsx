"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteToCampaign({ email, name, campaigns }: { email: string; name: string; campaigns: { slug: string; name: string }[] }) {
  const [slug, setSlug] = useState(campaigns[0]?.slug ?? ""); const [msg, setMsg] = useState("");
  if (!campaigns.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select className="input" style={{ width: "auto", padding: "7px 10px" }} value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Your campaign">
        {campaigns.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm" onClick={async () => {
        const r = await fetch(`/api/campaigns/${slug}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails: [email] }) });
        setMsg(r.ok ? `Invited ${name.split(" ")[0]}. They'll see it on their matches page.` : (await r.json()).error);
      }}>Invite</button>
      {msg && <span className="small muted">{msg}</span>}
    </span>
  );
}

export function JoinInvite({ code }: { code: string }) {
  const router = useRouter(); const [err, setErr] = useState("");
  return (<>
    <button className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} onClick={async () => {
      const r = await fetch(`/api/join/${code}`, { method: "POST" }); const d = await r.json();
      if (!r.ok) return setErr(d.error); router.push(`/c/${d.slug}`);
    }}>Join as co-organizer</button>
    {err && <span className="err">{err}</span>}
  </>);
}

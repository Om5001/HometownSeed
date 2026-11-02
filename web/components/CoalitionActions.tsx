"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PrintButton() {
  return <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Download or print (PDF)</button>;
}

export function ApproveForm({ poolId, documentId, campaign, defaultName }: { poolId: string; documentId: string; campaign: { slug: string; name: string }; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName); const [agree, setAgree] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <b>{campaign.name}</b>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I&apos;ve read this agreement and approve it on behalf of {campaign.name}.</span></label>
      <div className="addrow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Type your full name to sign" placeholder="Type your full name" />
        <button className="btn btn-green btn-sm" disabled={!agree || busy} onClick={async () => {
          setBusy(true); setErr("");
          const r = await fetch(`/api/coalitions/${poolId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId, campaign: campaign.slug, name, agree }) });
          setBusy(false);
          if (!r.ok) return setErr((await r.json()).error);
          router.refresh();
        }}>{busy ? "Signing…" : "Sign"}</button></div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

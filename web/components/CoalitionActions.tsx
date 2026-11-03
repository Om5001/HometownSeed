"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/refresh";

export function PrintButton() {
  return <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Download or print (PDF)</button>;
}

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

/** Each person in the coalition signs for themselves. */
export function SignForm({ poolId, documentId, defaultName }: { poolId: string; documentId: string; defaultName: string }) {
  const router = useRouter(); const refresh = useRefresh();
  const [name, setName] = useState(defaultName); const [agree, setAgree] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 10, marginTop: 12 }}>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I&apos;ve read this agreement and I agree to it.</span></label>
      <div className="addrow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Type your full name to sign" placeholder="Type your full name" />
        <button className="btn btn-green btn-sm" disabled={!agree || busy} onClick={async () => {
          setBusy(true); setErr("");
          try { await post(`/api/coalitions/${poolId}/approve`, { documentId, name, agree }); refresh(); }
          catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? "Signing…" : "Sign"}</button></div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

/** Leave instead of signing. Explains exactly what happens to this person's pledges and campaigns. */
export function LeaveCoalition({ poolId, consequences, backTo }: { poolId: string; consequences: string[]; backTo: string }) {
  const router = useRouter(); const refresh = useRefresh();
  const [open, setOpen] = useState(false); const [ok, setOk] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (!open) return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Leave the coalition instead</button>;
  return (
    <div className="stack danger" style={{ gap: 10, border: "1px solid", borderRadius: 12, padding: 14 }}>
      <b>Leave this coalition?</b>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>I understand. Take me out.</span></label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }} disabled={!ok || busy} onClick={async () => {
          setBusy(true); setErr("");
          try { await post(`/api/coalitions/${poolId}/leave`, { confirm: true }); router.push(backTo); refresh(); }
          catch (e) { setErr((e as Error).message); setBusy(false); }
        }}>{busy ? "Leaving…" : "Leave the coalition"}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

type DonorOpt = { id: string; name: string; ein: string; city: string | null; state: string | null; verified_source: string; rep_name: string };

/** Organizers pick who applies to Treasury: Hometown Seed's 501(c)(3), or a member's nonprofit. */
export function DonorChooser({ poolId, current, options, platformName, confirmed }: { poolId: string; current: string | null; options: DonorOpt[]; platformName: string; confirmed: boolean }) {
  const router = useRouter(); const refresh = useRefresh();
  const [sel, setSel] = useState<string | null>(current); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const fmtEin = (e: string) => e.slice(0, 2) + "-" + e.slice(2);
  const opt = (id: string | null, title: React.ReactNode, sub: string) => (
    <label className={"donor-opt" + (sel === id ? " on" : "")} key={id ?? "platform"}>
      <input type="radio" name="donor" checked={sel === id} onChange={() => setSel(id)} />
      <span><b>{title}</b><br /><small className="muted">{sub}</small></span>
    </label>
  );
  return (
    <div className="stack" style={{ gap: 8 }}>
      {opt(null, platformName, "Hometown Seed's own 501(c)(3). Its representative signs Treasury's application.")}
      {options.map((o) => opt(o.id, <>{o.name} {o.verified_source !== "self" ? <span className="np-badge">✓ verified</span> : <span className="np-badge self">self-reported</span>}</>,
        `EIN ${fmtEin(o.ein)}${o.city ? ` · ${o.city}, ${o.state}` : ""} · ${o.rep_name} signs the application for it`))}
      {!options.length && <p className="small muted">Nobody in this coalition has added a nonprofit yet. Members who represent a 501(c)(3) can add it on their profile; it will show up here. <a href="/nonprofits">Find a nonprofit</a></p>}
      <button className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy || sel === current} onClick={async () => {
        setBusy(true); setErr("");
        try { await post(`/api/coalitions/${poolId}/donor`, { nonprofitId: sel }); refresh(); }
        catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Use this Qualified Donor"}</button>
      {confirmed && <p className="small muted">Changing it draws up a new version of the agreement for everyone to sign.</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

/** The member nonprofit's representative certifies and signs Section 4 of Treasury's application. */
export function DonorSignForm({ poolId, repName, org }: { poolId: string; repName: string; org: string }) {
  const router = useRouter(); const refresh = useRefresh();
  const [ok, setOk] = useState(false); const [name, setName] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I certify under penalties of perjury that I am an authorized representative of {org}, with authority to make these representations and this contribution on its behalf.</span></label>
      <div className="addrow"><input className="input" placeholder={repName} value={name} onChange={(e) => setName(e.target.value)} aria-label="Type your full name to sign" />
        <button className="btn btn-green btn-sm" disabled={!ok || busy} onClick={async () => {
          setBusy(true); setErr("");
          try { await post(`/api/coalitions/${poolId}/donor-sign`, { name, certify: ok }); refresh(); }
          catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? "Signing…" : "Sign Section 4"}</button></div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Application, DonorInput } from "@/lib/treasury";
import { money } from "@/lib/format";

type Sub = { status: string; application: Application | null; application_hash: string | null; treasury_reference: string | null;
  submitted_at: string | null; payment: Record<string, string> | null; amount_cents: number } | null;
type Msg = { id: string; direction: string; to_address: string; from_address: string; subject: string; body: string; attachment_name: string | null; status: string; created_at: string };

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

const STEPS = [
  { s: "approved", t: "Application prepared" }, { s: "submitted", t: "Sent to Treasury" }, { s: "accepted", t: "Treasury approved" },
  { s: "funded", t: "Money sent" }, { s: "distributed", t: "In kids' accounts" },
];

export function TreasuryPanel({ poolId, status, sub, defaults, messages, mock }: {
  poolId: string; status: string; sub: Sub; messages: Msg[]; mock: boolean;
  defaults: { amount_cents: number; recognition_name: string; rep_name: string; rep_email: string };
}) {
  const router = useRouter();
  const a = sub?.application;
  const [f, setF] = useState<DonorInput>({
    entity_name: a?.section1.entity_name ?? "", entity_address: a?.section1.entity_address ?? "", ein: a?.section1.ein ?? "",
    entity_type: a?.section1.entity_type ?? "501c3",
    rep_name: a?.section1.rep_name ?? defaults.rep_name, rep_title: a?.section1.rep_title ?? "", rep_address: a?.section1.rep_address ?? "",
    rep_email: a?.section1.rep_email ?? defaults.rep_email, rep_phone: a?.section1.rep_phone ?? "",
    amount_cents: a?.section2.amount_cents ?? defaults.amount_cents,
    recognition: a?.section3.recognition ?? true, recognition_name: a?.section3.recognition_name ?? defaults.recognition_name,
    signature: "", certify: false,
  });
  const [amount, setAmount] = useState(String((a?.section2.amount_cents ?? defaults.amount_cents) / 100));
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ method: "ach", reference: "", amount: String((sub?.amount_cents ?? 0) / 100) });
  const editable = status === "approved" || status === "rejected";
  const idx = status === "rejected" ? 0 : STEPS.findIndex((x) => x.s === status);
  const set = (k: keyof DonorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg("");
    try { await fn(); if (ok) setMsg(ok); router.refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="panel noprint" id="treasury" style={{ maxWidth: 860, margin: "18px auto 0" }}>
      <div className="panel-head"><div><p className="eyebrow">Step 3 · Treasury approval</p><h2 style={{ marginTop: 4 }}>Contribution application</h2></div>
        {mock && <span className="tag o">Mock mode: nothing is sent to Treasury</span>}</div>
      <ol className="tracker" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))", marginBottom: 16 }}>
        {STEPS.map((x, i) => <li key={x.s} className={i < idx || status === "distributed" ? "done" : i === idx ? "now" : ""}>
          <span className="dot">{i < idx || status === "distributed" ? "✓" : i + 1}</span><div><b>{x.t}</b></div></li>)}
      </ol>
      {status === "rejected" && <p className="notice"><b>Treasury didn&apos;t approve the application.</b> Check the message below, update the details and send it again.</p>}
      <p className="hint">This is Treasury&apos;s <i>Trump Accounts Qualified Class Contribution Application</i> (draft of June 10, 2026). The <b>Qualified Donor</b> is the partner charity that receives your coalition&apos;s gifts and sends one contribution to Treasury, so its authorized representative should fill in and sign Sections 1 and 4. The draft form only lists nationwide, birth-year and state classes, and says ZIP-code areas need a separate request; your ZIP codes and kid counts go in Attachment A.</p>

      {editable && (
        <div className="stack" style={{ marginTop: 14 }}>
          <h3>Section 1: Qualified Donor</h3>
          <div className="row">
            <label className="field"><span>Organization name</span><input className="input" value={f.entity_name} onChange={set("entity_name")} /></label>
            <label className="field"><span>EIN</span><input className="input" placeholder="12-3456789" value={f.ein} onChange={set("ein")} /></label>
          </div>
          <label className="field"><span>Organization address</span><input className="input" value={f.entity_address} onChange={set("entity_address")} /></label>
          <label className="field"><span>Entity type</span>
            <select className="input" value={f.entity_type} onChange={set("entity_type")}>
              <option value="501c3">501(c)(3) tax-exempt organization</option><option value="state">State or District of Columbia</option>
              <option value="subdivision">Political subdivision of a state (city, county)</option><option value="tribal">Indian tribal government</option>
            </select></label>
          <div className="row">
            <label className="field"><span>Authorized representative</span><input className="input" value={f.rep_name} onChange={set("rep_name")} /></label>
            <label className="field"><span>Title</span><input className="input" value={f.rep_title} onChange={set("rep_title")} /></label>
          </div>
          <label className="field"><span>Representative address</span><input className="input" value={f.rep_address} onChange={set("rep_address")} /></label>
          <div className="row">
            <label className="field"><span>Email</span><input className="input" type="email" value={f.rep_email} onChange={set("rep_email")} /></label>
            <label className="field"><span>Phone</span><input className="input" value={f.rep_phone} onChange={set("rep_phone")} /></label>
          </div>
          <h3>Section 2: Contribution</h3>
          <label className="field"><span>Proposed contribution amount <em>pledged so far: {money(defaults.amount_cents)}</em></span>
            <div className="money"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div></label>
          <h3>Section 3: Public recognition</h3>
          <label className="check"><input type="checkbox" checked={f.recognition} onChange={(e) => setF({ ...f, recognition: e.target.checked })} /><span>Authorize Treasury to publicly recognize this contribution</span></label>
          {f.recognition && <label className="field"><span>Recognition name</span><input className="input" value={f.recognition_name} onChange={set("recognition_name")} /></label>}
          <h3>Section 4: Representations and signature</h3>
          <p className="small muted">The representative confirms the information is accurate and complete, the organization is a Qualified Donor, sending this isn&apos;t acceptance by Treasury, and they&apos;ve reviewed the Qualified Class Contribution Agreement. They certify under penalties of perjury that they&apos;re authorized to sign.</p>
          <label className="check"><input type="checkbox" checked={f.certify} onChange={(e) => setF({ ...f, certify: e.target.checked })} /><span>I am the authorized representative named above and I certify these representations.</span></label>
          <label className="field"><span>Type your full name to sign</span><input className="input" value={f.signature} onChange={set("signature")} placeholder={f.rep_name} /></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-green btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/application`, { ...f, amount_cents: Math.round((Number(amount.replace(/[^0-9.]/g, "")) || 0) * 100) }), "Application saved. Review the PDF, then send it.")}>Save application</button>
            {a && <a className="btn btn-ghost btn-sm" href={`/api/coalitions/${poolId}/application/pdf`} target="_blank">Preview PDF</a>}
            {a && status === "approved" && <button className="btn btn-green btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/submit`, {}))}>{mock ? "Send to Treasury (mock)" : "Send to Treasury"}</button>}
          </div>
        </div>
      )}

      {!editable && a && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <p className="small">Sent {sub?.submitted_at ? new Date(sub.submitted_at).toLocaleString("en-US") : ""} by {a.section1.entity_name} · reference <b className="num">{sub?.treasury_reference}</b> · {money(a.section2.amount_cents)}</p>
          <a className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} href={`/api/coalitions/${poolId}/application/pdf`} target="_blank">Download the application (PDF)</a>
        </div>
      )}

      {status === "accepted" && (
        <div className="stack" style={{ marginTop: 14 }}>
          <h3>Step 4: Send the money</h3>
          <p className="hint">Treasury approved. The charity transfers the contribution electronically from a U.S. bank by ACH or wire, using the instructions Treasury provides, then records it here.</p>
          <div className="row r3">
            <label className="field"><span>Method</span><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="ach">ACH</option><option value="wire">Wire</option></select></label>
            <label className="field"><span>Trace or wire reference</span><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></label>
            <label className="field"><span>Amount sent</span><div className="money"><input className="input" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div></label>
          </div>
          <button className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy}
            onClick={() => run(() => post(`/api/coalitions/${poolId}/payment`, { method: pay.method, reference: pay.reference, amount_cents: Math.round((Number(pay.amount.replace(/[^0-9.]/g, "")) || 0) * 100) }))}>Record payment</button>
        </div>
      )}
      {sub?.payment && <p className="small" style={{ marginTop: 10 }}>Paid {money(Number(sub.payment.amount_cents))} by {String(sub.payment.method).toUpperCase()} · reference {sub.payment.reference}</p>}

      {mock && ["submitted", "funded"].includes(status) && (
        <div className="notice" style={{ marginTop: 14 }}>
          <b>Treasury simulator.</b> Treasury isn&apos;t connected yet, so you can play its part to test the flow.
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {status === "submitted" && <>
              <button className="btn btn-green btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/treasury-mock`, { action: "approve" }))}>Simulate: Treasury approves</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/treasury-mock`, { action: "reject" }))}>Simulate: not approved</button>
            </>}
            {status === "funded" && <button className="btn btn-green btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/treasury-mock`, { action: "distribute" }))}>Simulate: Treasury distributes to accounts</button>}
          </div>
        </div>
      )}
      {msg && <p className="small" style={{ marginTop: 10 }} role="status">{msg}</p>}

      {messages.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>Messages {mock && <span className="small muted">(mock: shown here instead of emailed)</span>}</h3>
          <div className="mcards" style={{ marginTop: 8 }}>
            {messages.map((m) => (
              <details key={m.id} className="mcard">
                <summary style={{ cursor: "pointer" }}><b>{m.direction === "in" ? "From Treasury: " : "To Treasury: "}{m.subject}</b>
                  <span className="small muted"> · {new Date(m.created_at).toLocaleString("en-US")}</span></summary>
                <p className="small muted">From {m.from_address} to {m.to_address}{m.attachment_name ? ` · attachment: ${m.attachment_name}` : ""}</p>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--f-body)", fontSize: 13, margin: 0 }}>{m.body}</pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Application } from "@/lib/treasury";
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

export function TreasuryPanel({ poolId, status, sub, messages, mock, placeholders, donorSign }: {
  poolId: string; status: string; sub: Sub; messages: Msg[]; mock: boolean; placeholders: string[]; donorSign?: React.ReactNode;
}) {
  const router = useRouter();
  const a = sub?.application;
  const [rec, setRec] = useState(a?.section3.recognition ?? true);
  const [recName, setRecName] = useState(a?.section3.recognition_name ?? "");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ method: "ach", reference: "", amount: String((sub?.amount_cents ?? 0) / 100) });
  const editable = status === "approved" || status === "rejected";
  const idx = status === "rejected" ? 0 : STEPS.findIndex((x) => x.s === status);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg("");
    try { await fn(); if (ok) setMsg(ok); router.refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const s1 = a?.section1;

  return (
    <section className="panel noprint" id="treasury" style={{ maxWidth: 860, margin: "18px auto 0" }}>
      <div className="panel-head"><div><p className="eyebrow">Step 3 · Treasury approval</p><h2 style={{ marginTop: 4 }}>Contribution application</h2></div>
        {mock && <span className="tag o">Mock mode: nothing is sent to Treasury</span>}</div>
      <ol className="tracker" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))", marginBottom: 16 }}>
        {STEPS.map((x, i) => <li key={x.s} className={i < idx || status === "distributed" ? "done" : i === idx ? "now" : ""}>
          <span className="dot">{i < idx || status === "distributed" ? "✓" : i + 1}</span><div><b>{x.t}</b></div></li>)}
      </ol>
      {status === "rejected" && <p className="notice"><b>Treasury didn&apos;t approve the application.</b> Check the message below, adjust it and send it again. To change who&apos;s in the coalition, anyone can still leave, which draws up a new agreement for the others to sign.</p>}
      <p className="hint">This is Treasury&apos;s <i>Trump Accounts Qualified Class Contribution Application</i> (draft of June 10, 2026), filled in from your signed agreement. <b>{s1?.entity_name ?? "The coalition's nonprofit"}</b>, a 501(c)(3), is the Qualified Donor: it receives the coalition&apos;s gifts, applies, and sends one contribution. Everyone in the coalition is listed with their signature in Attachment B. The draft form only lists nationwide, birth-year and state classes and says ZIP-code areas need a separate request, so your ZIP codes and kid counts go in Attachment A.</p>
      {placeholders.length > 0 && <p className="notice" style={{ marginTop: 10 }}><b>Nonprofit details still to fill in:</b> {placeholders.join(", ")}. {a?.donor_kind === "member" ? <>The representative can add them to the nonprofit on their profile.</> : <>Set them in <code>web/lib/platform.ts</code> (or the ORG_ variables in <code>.env.local</code>).</>} Until then the PDF is marked as a draft{mock ? "" : " and can't be sent"}.</p>}

      {a && (
        <div className="appsum">
          <div><span>Section 1 · Qualified Donor</span><b>{s1!.entity_name}</b><small>501(c)(3) · EIN {s1!.ein} · {s1!.entity_address}</small><small>Authorized representative: {s1!.rep_name}, {s1!.rep_title} · {s1!.rep_email}</small></div>
          <div><span>Section 2 · Contribution</span><b>{money(a.section2.amount_cents)}</b><small>Qualified Geographic Area: {a.attachment_a.zip_codes.length} ZIP code{a.attachment_a.zip_codes.length === 1 ? "" : "s"}, about {a.attachment_a.est_beneficiaries_in_class.toLocaleString("en-US")} kids, ages {a.attachment_a.ages}</small></div>
          <div><span>Section 4 · Signature</span>{a.section4.signature ? <><b>/s/ {a.section4.signature}</b><small>for the Qualified Donor, {a.section4.date}</small></> : <><b>Not signed yet</b><small>{a.section1.rep_name} signs for {a.section1.entity_name}</small></>}</div>
          <div><span>Attachment B · Coalition</span><b>{a.attachment_b.people.length} {a.attachment_b.people.length === 1 ? "person" : "people"} signed</b><small>{a.attachment_b.people.map((p) => p.name).join(", ")}</small></div>
        </div>
      )}

      {donorSign && (
        <div className="stack" style={{ marginTop: 14 }}>
          <h3>Section 4: Signature of the Qualified Donor</h3>
          {donorSign}
        </div>
      )}

      {editable && a && (
        <div className="stack" style={{ marginTop: 14 }}>
          <h3>Section 3: Public recognition</h3>
          <label className="check"><input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} /><span>Authorize Treasury to publicly recognize this contribution</span></label>
          {rec && <label className="field"><span>Recognition name</span><input className="input" value={recName} onChange={(e) => setRecName(e.target.value)} /></label>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/application`, { recognition: rec, recognition_name: recName }), "Saved.")}>Save</button>
            <a className="btn btn-ghost btn-sm" href={`/api/coalitions/${poolId}/application/pdf`} target="_blank">Preview PDF</a>
            <button className="btn btn-green btn-sm" disabled={busy} onClick={() => run(() => post(`/api/coalitions/${poolId}/submit`, {}))}>{mock ? "Send to Treasury (mock)" : "Send to Treasury"}</button>
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
          <p className="hint">Treasury approved. Hometown Seed's nonprofit transfers the contribution electronically from a U.S. bank by ACH or wire, using the instructions Treasury provides, then records it here.</p>
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

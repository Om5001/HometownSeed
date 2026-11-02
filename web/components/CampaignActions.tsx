"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, perChild } from "@/lib/format";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

export function PledgeForm({ slug, kids, where, user }: { slug: string; kids: number; where: string; user: { display_name: string; email: string } | null }) {
  const router = useRouter();
  const [amt, setAmt] = useState(100); const [custom, setCustom] = useState("");
  const [name, setName] = useState(user?.display_name ?? ""); const [email, setEmail] = useState(user?.email ?? "");
  const [anon, setAnon] = useState(false); const [msg, setMsg] = useState(""); const [fees, setFees] = useState(true);
  const [err, setErr] = useState(""); const [done, setDone] = useState<number | null>(null); const [busy, setBusy] = useState(false);
  const dollars = custom ? Number(custom.replace(/[^0-9.]/g, "")) || 0 : amt;
  const cents = Math.round(dollars * 100);
  if (done !== null) return (
    <div className="thanks">
      <div className="ring">✓</div><h3>Thank you{anon ? "" : ", " + name.split(" ")[0]}!</h3>
      <p>Your {money(done)} pledge is recorded. That&apos;s about {perChild(done / Math.max(kids, 1))} for each of {kids.toLocaleString()} kids in {where}.</p>
      <p className="notice"><b>Prototype:</b> no money was charged. Real payments will run through the partner charity.</p>
      <button className="btn btn-ghost" onClick={() => setDone(null)}>Make another pledge</button>
    </div>
  );
  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault(); setErr(""); setBusy(true);
      try { await post(`/api/campaigns/${slug}/pledges`, { amountCents: cents, name, email, anonymous: anon, message: msg, coverFees: fees }); setDone(cents); router.refresh(); }
      catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <div className="subhead"><h3><span className="n">$</span>Pledge to this campaign</h3></div>
      <div className="amts" role="group" aria-label="Gift amount">
        {[25, 50, 100, 250, 500, 1000].map((a) => (
          <button type="button" key={a} className="amt" aria-pressed={!custom && amt === a} onClick={() => { setAmt(a); setCustom(""); }}>${a.toLocaleString()}</button>
        ))}
      </div>
      <label className="field"><span>Or enter an amount</span><div className="money"><input className="input" inputMode="decimal" placeholder="Other amount" value={custom} onChange={(e) => setCustom(e.target.value)} /></div></label>
      {cents > 0 && kids > 0 && <p className="hint">= <b className="num">{perChild(cents / kids)}</b> for each of {kids.toLocaleString()} kids</p>}
      <div className="row">
        <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      </div>
      <label className="field"><span>Message <em>optional</em></span><input className="input" maxLength={280} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /><span>Show my gift as Anonymous</span></label>
      <label className="check"><input type="checkbox" checked={fees} onChange={(e) => setFees(e.target.checked)} /><span>Add 3% to cover processing so 100% reaches kids</span></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-green submit" disabled={busy || cents < 500}>{busy ? "Saving…" : `Pledge ${money(cents)}`}</button>
      <p className="small muted">Prototype: pledges are recorded but no payment is taken.</p>
    </form>
  );
}

export function PoolButton({ fromSlug, toSlug, disabled, pending }: { fromSlug: string; toSlug: string; disabled?: string; pending?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "sent" | string>(pending ? "sent" : "idle");
  if (disabled) return <span className="small muted">{disabled}</span>;
  if (state === "sent") return <span className="tag g">Pool request sent</span>;
  return (
    <>
      <button className="btn btn-green btn-sm" disabled={state === "busy"} onClick={async () => {
        setState("busy");
        try { await post(`/api/campaigns/${fromSlug}/pool-requests`, { toSlug }); setState("sent"); router.refresh(); }
        catch (x) { setState((x as Error).message); }
      }}>Request to pool</button>
      {state !== "idle" && state !== "busy" && <span className="err">{state}</span>}
    </>
  );
}

export function RequestButtons({ id, mine }: { id: string; mine?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const act = async (action: string) => { try { await post(`/api/pool-requests/${id}`, { action }); router.refresh(); } catch (x) { setErr((x as Error).message); } };
  return (
    <div className="acts">
      {mine ? <button className="btn btn-ghost btn-sm" onClick={() => act("withdraw")}>Withdraw</button> : (
        <><button className="btn btn-green btn-sm" onClick={() => act("accept")}>Accept and pool</button>
          <button className="btn btn-ghost btn-sm" onClick={() => act("decline")}>Decline</button></>
      )}
      {err && <span className="err">{err}</span>}
    </div>
  );
}

export function InvitePanel({ slug }: { slug: string }) {
  const [link, setLink] = useState(""); const [emails, setEmails] = useState(""); const [note, setNote] = useState("");
  const get = async (list: string[] = []) => {
    try { const d = await post(`/api/campaigns/${slug}/invites`, { emails: list }); setLink(d.link); if (list.length) setNote(`Saved ${d.recorded} invite${d.recorded === 1 ? "" : "s"}. Share the link with them.`); }
    catch (x) { setNote((x as Error).message); }
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {!link ? <button className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => get()}>Get invite link</button> : (
        <div className="copyrow"><input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(link); setNote("Link copied."); }}>Copy</button></div>
      )}
      <div className="addrow"><input className="input" placeholder="friend@email.com, another@email.com" value={emails} onChange={(e) => setEmails(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => get(emails.split(/[,\s]+/).filter(Boolean))}>Add</button></div>
      <p className="small muted">Friends who open the link join as co-organizers. {note}</p>
    </div>
  );
}

export function ShareButton({ path }: { path: string }) {
  const [t, setT] = useState("Share");
  return <button className="btn btn-ghost btn-sm" onClick={() => {
    const url = location.origin + path;
    if (navigator.share) navigator.share({ url }).catch(() => {}); else { navigator.clipboard?.writeText(url); setT("Link copied"); }
  }}>{t}</button>;
}

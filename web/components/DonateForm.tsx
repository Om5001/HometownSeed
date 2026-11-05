"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRefresh } from "@/lib/refresh";
import { money } from "@/lib/format";
import { ZipSearch } from "./ZipSearch";

const AMOUNTS = [25, 50, 100, 250, 1000];
type Where = "anywhere" | "state" | "zip";

/** Give to the Hometown Seed Fund: amount, once or monthly, and where it should go. */
export function DonateForm({ user, states }: { user: { display_name: string; email_verified: boolean } | null; states: Record<string, string> }) {
  const refresh = useRefresh();
  const [amt, setAmt] = useState(50); const [custom, setCustom] = useState("");
  const [freq, setFreq] = useState<"once" | "monthly">("once");
  const [where, setWhere] = useState<Where>("anywhere");
  const [state, setState] = useState(""); const [zip, setZip] = useState<{ zcta: string; label: string } | null>(null);
  const [anon, setAnon] = useState(false); const [msg, setMsg] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ cents: number; where: string; freq: string } | null>(null);
  const sending = useRef(false);
  const cents = Math.round((custom ? Number(custom.replace(/[^0-9.]/g, "")) || 0 : amt) * 100);
  const whereText = where === "state" ? states[state] ?? "a state" : where === "zip" ? zip?.label ?? "a ZIP code" : "wherever it's needed most";

  if (!user) return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="hint">Sign in to give, so we can send your tax receipt and tell you when your gift reaches children&apos;s accounts.</p>
      <Link className="btn btn-green submit" href="/signin?next=/donate">Sign in to donate</Link>
      <Link className="small" href="/signin?mode=signup&next=/donate">New here? Create an account</Link>
    </div>
  );
  if (done) return (
    <div className="thanks">
      <div className="ring">✓</div>
      <h3>Thank you{anon ? "" : ", " + user.display_name.split(" ")[0]}!</h3>
      <p>Your {money(done.cents)}{done.freq === "monthly" ? " monthly" : ""} gift to the Hometown Seed Fund is recorded, for {done.where}.</p>
      <p className="notice"><b>Prototype:</b> no money was charged. When payments are live, you&apos;ll get a tax receipt from Hometown Seed Foundation, a 501(c)(3).</p>
      <button className="btn btn-ghost" onClick={() => { setDone(null); setMsg(""); }}>Give again</button>
    </div>
  );
  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault(); if (sending.current) return;
      if (where === "state" && !state) return setErr("Choose a state.");
      if (where === "zip" && !zip) return setErr("Choose a ZIP code.");
      sending.current = true; setErr(""); setBusy(true);
      try {
        const r = await fetch("/api/donations", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ amountCents: cents, frequency: freq, designation: where, state, zip: zip?.zcta, anonymous: anon, message: msg }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Something went wrong.");
        setDone({ cents, where: whereText, freq }); refresh(false);
      } catch (x) { setErr((x as Error).message); } finally { setBusy(false); sending.current = false; }
    }}>
      {!user.email_verified && <p className="notice">Confirm your email first (check the banner at the top), then you can give.</p>}
      <div className="seg wide" role="group" aria-label="How often">
        <button type="button" aria-pressed={freq === "once"} onClick={() => setFreq("once")}>One time</button>
        <button type="button" aria-pressed={freq === "monthly"} onClick={() => setFreq("monthly")}>Monthly</button>
      </div>
      <div className="amts" role="group" aria-label="Gift amount">
        {AMOUNTS.map((a) => <button type="button" key={a} className="amt" aria-pressed={!custom && amt === a} onClick={() => { setAmt(a); setCustom(""); }}>${a.toLocaleString()}</button>)}
      </div>
      <label className="field"><span>Or enter an amount</span><div className="money"><input className="input" inputMode="decimal" placeholder="Other amount" value={custom} onChange={(e) => setCustom(e.target.value)} /></div></label>

      <fieldset className="where">
        <legend>Where should it go?</legend>
        <label className="check"><input type="radio" name="where" checked={where === "anywhere"} onChange={() => setWhere("anywhere")} /><span><b>Wherever it&apos;s needed most.</b> We add it to coalitions that are ready to go to Treasury, starting with lower-income areas.</span></label>
        <label className="check"><input type="radio" name="where" checked={where === "state"} onChange={() => setWhere("state")} /><span><b>A state</b></span></label>
        {where === "state" && (
          <select className="input" value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">Choose a state</option>
            {Object.entries(states).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <label className="check"><input type="radio" name="where" checked={where === "zip"} onChange={() => setWhere("zip")} /><span><b>A ZIP code or town</b></span></label>
        {where === "zip" && (zip
          ? <div className="zchips"><span className="zchip"><span>{zip.label}</span><button type="button" aria-label="Change ZIP" onClick={() => setZip(null)}>×</button></span></div>
          : <ZipSearch mini button="Choose" placeholder="ZIP code or town" onPick={(h) => setZip({ zcta: h.zcta, label: `${h.zcta}${h.place_name ? " · " + h.place_name + ", " + h.place_state : ""}` })} />)}
      </fieldset>

      <label className="field"><span>A note <em>optional, shown with your gift</em></span><input className="input" maxLength={280} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="For the kids in my hometown" /></label>
      <label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /><span>Show my gift as anonymous</span></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-green submit" disabled={busy || cents < 500 || !user.email_verified}>
        {busy ? "Saving…" : `Give ${money(cents)}${freq === "monthly" ? " a month" : ""}`}</button>
      <p className="small muted">Gifts go to Hometown Seed Foundation, a 501(c)(3), and are tax-deductible to the extent the law allows.</p>
    </form>
  );
}

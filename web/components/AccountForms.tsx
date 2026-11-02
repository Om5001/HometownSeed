"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: object = {}) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

export function AccountForms({ name }: { name: string }) {
  const router = useRouter();
  const [n, setN] = useState(name); const [nMsg, setNMsg] = useState("");
  const [cur, setCur] = useState(""); const [nx, setNx] = useState(""); const [pMsg, setPMsg] = useState("");
  const [dPw, setDPw] = useState(""); const [dConf, setDConf] = useState(""); const [dMsg, setDMsg] = useState("");
  return (
    <div className="builder">
      <section className="panel bstep">
        <div className="subhead"><h3>Name</h3></div>
        <div className="addrow"><input className="input" value={n} onChange={(e) => setN(e.target.value)} maxLength={60} aria-label="Your name" />
          <button className="btn btn-ghost btn-sm" onClick={async () => { try { await post("/api/account", { name: n }); setNMsg("Saved."); router.refresh(); } catch (e) { setNMsg((e as Error).message); } }}>Save</button></div>
        {nMsg && <p className="small muted">{nMsg}</p>}
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3>Password</h3></div>
        <div className="row">
          <label className="field"><span>Current password</span><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
          <label className="field"><span>New password <em>10+ characters</em></span><input className="input" type="password" value={nx} onChange={(e) => setNx(e.target.value)} autoComplete="new-password" /></label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-green btn-sm" onClick={async () => { try { await post("/api/account/password", { current: cur, next: nx }); setCur(""); setNx(""); setPMsg("Password changed. Other devices were signed out."); } catch (e) { setPMsg((e as Error).message); } }}>Change password</button>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await post("/api/account/signout-all"); location.href = "/signin"; }}>Sign out on all devices</button>
        </div>
        {pMsg && <p className="small muted">{pMsg}</p>}
      </section>

      <section className="panel bstep" style={{ borderColor: "var(--red)" }}>
        <div className="subhead"><h3>Delete account</h3></div>
        <p className="hint">This permanently deletes your account, profile, matches and sessions. Campaigns you started pass to a co-organizer; if there&apos;s none, they&apos;re removed, or closed if people already pledged. Your pledges stay in the charity&apos;s records as &ldquo;Deleted account&rdquo;. This can&apos;t be undone.</p>
        <div className="row">
          <label className="field"><span>Your password</span><input className="input" type="password" value={dPw} onChange={(e) => setDPw(e.target.value)} autoComplete="current-password" /></label>
          <label className="field"><span>Type DELETE to confirm</span><input className="input" value={dConf} onChange={(e) => setDConf(e.target.value)} /></label>
        </div>
        <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff", alignSelf: "flex-start" }} disabled={dConf !== "DELETE" || !dPw}
          onClick={async () => { try { await post("/api/account/delete", { password: dPw, confirm: dConf }); location.href = "/?deleted=1"; } catch (e) { setDMsg((e as Error).message); } }}>Delete my account</button>
        {dMsg && <p className="err">{dMsg}</p>}
      </section>
    </div>
  );
}

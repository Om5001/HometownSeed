"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Form() {
  const router = useRouter(); const token = useSearchParams().get("token") || "";
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault(); setErr("");
      if (pw !== pw2) return setErr("The two passwords don't match.");
      setBusy(true);
      const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
      setBusy(false);
      if (!r.ok) return setErr((await r.json()).error);
      router.push("/match"); router.refresh();
    }}>
      <label className="field"><span>New password <em>at least 10 characters</em></span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
      <label className="field"><span>Type it again</span><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-green submit" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
      <p className="small muted">This signs you out on every other device.</p>
    </form>
  );
}
export default function Reset() {
  return <main className="wrap"><section className="panel signin-card stack"><h2>Choose a new password</h2><Suspense><Form /></Suspense></section></main>;
}

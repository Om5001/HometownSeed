"use client";
import { useState } from "react";
import Link from "next/link";

export default function Forgot() {
  const [email, setEmail] = useState(""); const [done, setDone] = useState(false); const [dev, setDev] = useState(""); const [err, setErr] = useState("");
  return (
    <main className="wrap"><section className="panel signin-card stack">
      <h2>Reset your password</h2>
      {done ? (<>
        <p className="lede2">If an account uses {email}, we&apos;ve sent a link to reset the password. It works once and expires in 1 hour.</p>
        {dev && <p className="notice"><b>Development mode:</b> email isn&apos;t set up yet, so here&apos;s the link: <a href={dev}>reset password</a></p>}
        <Link href="/signin">Back to sign in</Link>
      </>) : (
        <form className="stack" noValidate onSubmit={async (e) => {
          e.preventDefault(); setErr("");
          const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
          const d = await r.json(); if (!r.ok) return setErr(d.error); setDev(d.devLink || ""); setDone(true);
        }}>
          <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          {err && <p className="err">{err}</p>}
          <button className="btn btn-green submit">Send reset link</button>
        </form>
      )}
    </section></main>
  );
}

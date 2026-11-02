"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Form() {
  const router = useRouter(); const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [err, setErr] = useState("");
  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault(); setErr("");
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name }) });
      if (!r.ok) return setErr((await r.json()).error);
      router.push(next.startsWith("/") ? next : "/"); router.refresh();
    }}>
      <label className="field"><span>Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-green submit">Continue</button>
      <p className="notice"><b>Prototype sign-in.</b> No password yet; this will switch to secure email sign-in before launch.</p>
    </form>
  );
}
export default function SignIn() {
  return (
    <main className="wrap"><section className="panel signin-card stack">
      <h2>Sign in</h2><p className="lede2">Organize campaigns, invite friends, and pool with others.</p>
      <Suspense><Form /></Suspense>
    </section></main>
  );
}

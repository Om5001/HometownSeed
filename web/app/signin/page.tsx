"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function Form() {
  const router = useRouter(); const sp = useSearchParams();
  const next = sp.get("next") || "";
  const [mode, setMode] = useState<"in" | "up">(sp.get("mode") === "signup" ? "up" : "in");
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : mode === "up" ? "/account?welcome=1" : "/match";
  if (sent) return (
    <div className="stack">
      <div className="thanks"><div className="ring">✉</div><h3>Check your email</h3>
        <p>We sent a confirmation link to <b>{email}</b>. Click it to unlock campaigns, pledges and matching. You can set up your profile meanwhile.</p></div>
      {sent.devLink && <p className="notice"><b>Development mode:</b> no email service is set up yet, so here&apos;s the link: <a href={sent.devLink}>confirm my email</a></p>}
      <button className="btn btn-green" onClick={() => { router.push(dest); router.refresh(); }}>Continue</button>
    </div>
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await fetch(mode === "in" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "in" ? { email, password: pw } : { email, password: pw, name }),
      });
      const d = await r.json();
      if (!r.ok) return setErr(d.error);
      if (mode === "up") { setSent(d.verification?.sent === false ? { devLink: d.verification.devLink } : {}); return; }
      router.push(dest); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="seg wide" role="group" aria-label="Sign in or create account">
        <button type="button" aria-pressed={mode === "in"} onClick={() => { setMode("in"); setErr(""); }}>Sign in</button>
        <button type="button" aria-pressed={mode === "up"} onClick={() => { setMode("up"); setErr(""); }}>Create account</button>
      </div>
      <form className="stack" noValidate onSubmit={submit}>
        {mode === "up" && <label className="field"><span>Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="field"><span>Password {mode === "up" && <em>at least 10 characters; a short phrase works well</em>}</span>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-green submit" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      {mode === "in" && <Link className="small" href="/forgot">Forgot your password?</Link>}
      {next && <p className="small muted">Sign in to start campaigns, pledge, and match with other givers.</p>}
    </>
  );
}

export default function SignIn() {
  return (
    <main className="wrap"><section className="panel signin-card stack">
      <h2>Welcome to Hometown Seed</h2>
      <p className="lede2">Start campaigns, find people giving to the same places, and pool your gifts.</p>
      <Suspense><Form /></Suspense>
    </section></main>
  );
}

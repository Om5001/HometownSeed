"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Form() {
  const router = useRouter(); const sp = useSearchParams();
  const next = sp.get("next") || "";
  const [mode, setMode] = useState<"in" | "up">(sp.get("mode") === "signup" ? "up" : "in");
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await fetch(mode === "in" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "in" ? { email, password: pw } : { email, password: pw, name }),
      });
      const d = await r.json();
      if (!r.ok) return setErr(d.error);
      const dest = next.startsWith("/") && !next.startsWith("//") ? next : mode === "up" ? "/profile?welcome=1" : "/match";
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
        <label className="field"><span>Password {mode === "up" && <em>at least 8 characters</em>}</span>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-green submit" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
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

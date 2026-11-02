"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/** Confirms on page load with a POST, so link scanners that only fetch the URL can't use up the link. */
function Confirm() {
  const router = useRouter(); const token = useSearchParams().get("token") || "";
  const [state, setState] = useState<"working" | "ok" | "bad">("working"); const [err, setErr] = useState("");
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return; once.current = true;
    (async () => {
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
      if (r?.ok) { setState("ok"); router.refresh(); }
      else { setErr(r ? (await r.json()).error : "Couldn't reach the site."); setState("bad"); }
    })();
  }, [token, router]);
  if (state === "working") return <p className="lede2">Confirming your email…</p>;
  if (state === "ok") return (<>
    <div className="thanks"><div className="ring">✓</div><h3>Email confirmed</h3><p>You can now start campaigns, pledge, and match with other givers.</p></div>
    <Link className="btn btn-green" href="/match">Find your matches</Link>
    <p className="small muted">Opened this on another device? <Link href="/signin">Sign in</Link> there to continue.</p>
  </>);
  return (<>
    <h2>That link didn&apos;t work</h2>
    <p className="lede2">{err}</p>
    <Link className="btn btn-green" href="/signin">Sign in</Link>
  </>);
}

export default function VerifyPage() {
  return <main className="wrap"><section className="panel signin-card stack"><Suspense><Confirm /></Suspense></section></main>;
}

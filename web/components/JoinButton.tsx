"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function JoinButton({ code }: { code: string }) {
  const router = useRouter(); const [err, setErr] = useState("");
  return (<>
    <button className="btn btn-green" onClick={async () => {
      const r = await fetch(`/api/join/${code}`, { method: "POST" }); const d = await r.json();
      if (!r.ok) return setErr(d.error); router.push(`/c/${d.slug}`);
    }}>Join as co-organizer</button>
    {err && <p className="err">{err}</p>}
  </>);
}

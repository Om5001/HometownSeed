"use client";
import { useState } from "react";

export function VerifyBanner({ email }: { email: string }) {
  const [msg, setMsg] = useState(""); const [dev, setDev] = useState("");
  return (
    <div className="verify-banner" role="status">
      <div className="wrap">
        <span><b>Confirm your email</b> to start campaigns, pledge and match. We sent a link to {email}.</span>
        <button className="linkbtn" onClick={async () => {
          const r = await fetch("/api/auth/resend", { method: "POST" }); const d = await r.json();
          if (!r.ok) return setMsg(d.error);
          setMsg("Sent. Check your inbox and spam folder."); if (d.verification?.devLink) setDev(d.verification.devLink);
        }}>Resend email</button>
        {msg && <span className="small">{msg}</span>}
        {dev && <span className="small">Development mode, no email service yet: <a href={dev}>confirm now</a></span>}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Nonprofit, OrgInfo } from "@/lib/nonprofits";
import { NonprofitBadge } from "./NonprofitBadge";

type Mine = Nonprofit & { title: string | null; phone: string | null };
const fmtEin = (e: string) => (e.length === 9 ? e.slice(0, 2) + "-" + e.slice(2) : e);
const srcLabel = { irs: "Verified with the IRS exempt-organization file", propublica: "Verified with ProPublica (IRS data)", self: "Self-reported" } as const;

async function call(url: string, body?: object) {
  const r = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

/** "Your nonprofit" on the profile: say you represent one, look it up by EIN, add it. */
export function NonprofitForm({ hasNonprofit, mine, verifiedEmail }: { hasNonprofit: boolean; mine: Mine[]; verifiedEmail: boolean }) {
  const router = useRouter();
  const [has, setHas] = useState(hasNonprofit || mine.length > 0);
  const [ein, setEin] = useState(""); const [org, setOrg] = useState<OrgInfo | null>(null); const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState(""); const [phone, setPhone] = useState("");
  const [manual, setManual] = useState({ name: "", address: "", city: "", state: "", zip: "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };

  const toggle = (v: boolean) => run(async () => { setHas(v); await call("/api/account", { has_nonprofit: v }); router.refresh(); });
  const lookup = () => run(async () => {
    setOrg(null); setNotFound(false);
    const d = await call("/api/nonprofits/lookup?ein=" + encodeURIComponent(ein));
    if (d.org) setOrg(d.org); else setNotFound(true);
  });
  const add = () => run(async () => {
    await call("/api/nonprofits", { ein, title, phone, ...(notFound ? manual : {}) });
    setEin(""); setOrg(null); setNotFound(false); setTitle(""); setPhone("");
    setMsg("Added. Your profile now shows the check mark."); router.refresh();
  });

  return (
    <div className="builder">
      <section className="panel bstep stack" style={{ gap: 12 }}>
        <div className="subhead"><h3>Your nonprofit</h3></div>
        <label className="check"><input type="checkbox" checked={has} disabled={busy || mine.length > 0} onChange={(e) => toggle(e.target.checked)} />
          <span>I represent a 501(c)(3) nonprofit {mine.length > 0 && <span className="small muted">(remove your nonprofits below to uncheck)</span>}</span></label>
        <p className="hint">A coalition&apos;s gift goes to Treasury through a 501(c)(3), the &ldquo;Qualified Donor.&rdquo; If you represent one, add it here and your coalitions can choose it instead of Hometown Seed&apos;s own nonprofit. Don&apos;t have one? <Link href="/nonprofits">Find a nonprofit</Link>, or use Hometown Seed&apos;s.</p>

        {mine.length > 0 && (
          <div className="np-list">{mine.map((n) => (
            <div className="np-card" key={n.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <b>{n.name}</b><NonprofitBadge compact verified={n.verified_source !== "self"} />
              </div>
              <small className="muted">EIN {fmtEin(n.ein)}{n.city ? ` · ${n.city}, ${n.state}` : ""} · You: {n.title}{n.phone ? `, ${n.phone}` : ""}</small>
              <small className="muted">{srcLabel[n.verified_source]}{n.deductible === false ? " · contributions are NOT listed as deductible" : ""}{n.source_url && <> · <a href={n.source_url} target="_blank" rel="noreferrer">ProPublica page</a></>}</small>
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy}
                onClick={() => run(async () => { await call(`/api/nonprofits/${n.id}/remove`, {}); router.refresh(); })}>Remove</button>
            </div>
          ))}</div>
        )}

        {has && (
          <div className="stack" style={{ gap: 10 }}>
            <b>Add {mine.length ? "another" : "your"} nonprofit</b>
            {!verifiedEmail && <p className="small muted">Confirm your email first to add a nonprofit.</p>}
            <div className="addrow">
              <input className="input" placeholder="EIN, like 12-3456789" value={ein} onChange={(e) => { setEin(e.target.value); setOrg(null); setNotFound(false); }} aria-label="EIN" />
              <button className="btn btn-green btn-sm" disabled={busy || ein.replace(/\D/g, "").length !== 9} onClick={lookup}>{busy ? "…" : "Look up"}</button>
            </div>
            {org && (
              <div className="np-card">
                <b>{org.name}</b>
                <small className="muted">{[org.address, org.city, org.state, org.zip].filter(Boolean).join(", ")}</small>
                <small>{org.is501c3 ? "✓ 501(c)(3)" : `Not a 501(c)(3) (subsection ${org.subsection ?? "unknown"})`}{org.deductible === true ? " · contributions deductible" : org.deductible === false ? " · contributions NOT deductible" : ""} · source: {org.source === "irs" ? "IRS exempt-organization file" : "ProPublica"}</small>
              </div>
            )}
            {notFound && (
              <div className="stack" style={{ gap: 8 }}>
                <p className="small">We couldn&apos;t find that EIN in IRS or ProPublica records (new organizations can take a few months to appear). Enter its details; it will show as self-reported until it&apos;s verified.</p>
                <label className="field"><span>Legal name</span><input className="input" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /></label>
                <label className="field"><span>Street address</span><input className="input" value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} /></label>
                <div className="row r3">
                  <label className="field"><span>City</span><input className="input" value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} /></label>
                  <label className="field"><span>State</span><input className="input" maxLength={2} value={manual.state} onChange={(e) => setManual({ ...manual, state: e.target.value.toUpperCase() })} /></label>
                  <label className="field"><span>ZIP</span><input className="input" value={manual.zip} onChange={(e) => setManual({ ...manual, zip: e.target.value })} /></label>
                </div>
              </div>
            )}
            {(org?.is501c3 || notFound) && (<>
              <div className="row">
                <label className="field"><span>Your title</span><input className="input" placeholder="Executive Director" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                <label className="field"><span>Phone <em>for Treasury&apos;s application</em></span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              </div>
              <p className="small muted">By adding it, you confirm you&apos;re authorized to act for this organization. If a coalition chooses it, you&apos;ll sign Treasury&apos;s application for it.</p>
              <button className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy || !verifiedEmail} onClick={add}>Add nonprofit</button>
            </>)}
          </div>
        )}
        {msg && <p className="small" role="status">{msg}</p>}
      </section>
    </div>
  );
}

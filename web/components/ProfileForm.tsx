"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ZipSearch } from "./ZipSearch";
import type { GivingProfile, ZipRow } from "@/lib/queries";
import { fmt, money, perChild as perChildFmt, placeLabel } from "@/lib/format";

const AGES = [
  { label: "All kids under 18", min: 0, max: 17 }, { label: "Ages 0–5", min: 0, max: 5 },
  { label: "Ages 6–12", min: 6, max: 12 }, { label: "Ages 13–17", min: 13, max: 17 },
];
const GIFTS = [
  { id: "cash", t: "Cash", d: "Card or bank transfer to the partner charity" },
  { id: "stock", t: "Stock", d: "Publicly traded U.S. shares, given to the charity" },
  { id: "daf", t: "Donor-advised fund", d: "A grant from your DAF to the charity" },
];

export function ProfileForm({ initial, zips, incomeLine, welcome }: { initial: GivingProfile | null; zips: ZipRow[]; incomeLine: number; welcome: boolean }) {
  const router = useRouter();
  const byZ = new Map(zips.map((z) => [z.zcta, z]));
  const [home, setHome] = useState<ZipRow | null>(initial?.home_zip ? byZ.get(initial.home_zip) ?? null : null);
  const [targets, setTargets] = useState<ZipRow[]>((initial?.target_zips ?? []).map((z) => byZ.get(z)).filter(Boolean) as ZipRow[]);
  const [radius, setRadius] = useState(initial?.radius_miles ?? 25);
  const [gifts, setGifts] = useState<string[]>(initial?.gift_types ?? ["cash"]);
  const [budget, setBudget] = useState(initial?.budget_cents ? String(initial.budget_cents / 100) : "");
  const [perChild, setPerChild] = useState(initial?.per_child_cents ? String(initial.per_child_cents / 100) : "");
  const [age, setAge] = useState({ min: initial?.min_age ?? 0, max: initial?.max_age ?? 17 });
  const [income, setIncome] = useState(initial?.income_focus ?? "any");
  const [open, setOpen] = useState(initial?.open_to_match ?? true);
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const dollars = (s: string) => { const n = Number(s.replace(/[^0-9.]/g, "")); return s.trim() && Number.isFinite(n) ? Math.round(n * 100) : null; };
  const kids = targets.reduce((s, z) => s + (z.kids_u18 || 0), 0);
  const budgetC = dollars(budget);

  const save = async () => {
    setErr(""); setBusy(true); setSaved(false);
    try {
      const r = await fetch("/api/profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          home_zip: home?.zcta ?? null, target_zips: targets.map((t) => t.zcta), radius_miles: radius, gift_types: gifts,
          budget_cents: budgetC, per_child_cents: dollars(perChild), min_age: age.min, max_age: age.max,
          income_focus: income, open_to_match: open, bio,
        }),
      });
      const d = await r.json();
      if (!r.ok) return setErr(d.error);
      setSaved(true);
      if (welcome) router.push("/match"); else router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="builder">
      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">1</span>Where</h3></div>
        <p className="hint">Your home ZIP sets distance. Add the ZIP codes or cities you most want to fund; leave it empty to see what&apos;s near home.</p>
        <label className="field"><span>Home ZIP</span></label>
        {home ? (
          <div className="zchips"><span className="zchip"><span><span className="num">{home.zcta}</span> {placeLabel(home)}</span><button type="button" aria-label="Clear home ZIP" onClick={() => setHome(null)}>×</button></span></div>
        ) : <ZipSearch mini button="Set" placeholder="Your ZIP code" onPick={(h) => setHome(h as ZipRow)} />}
        <label className="field" style={{ marginTop: 6 }}><span>Places you want to fund <em>optional</em></span></label>
        <ZipSearch mini button="Add" placeholder="ZIP code or city" onPick={(h) => setTargets((t) => t.some((x) => x.zcta === h.zcta) ? t : [...t, h as ZipRow])} />
        {targets.length > 0 && (
          <div className="zchips">{targets.map((z) => (
            <span key={z.zcta} className="zchip"><span><span className="num">{z.zcta}</span> {placeLabel(z)}</span><span className="num">{fmt(z.kids_u18)}</span>
              <button type="button" aria-label={`Remove ${z.zcta}`} onClick={() => setTargets((t) => t.filter((x) => x.zcta !== z.zcta))}>×</button></span>
          ))}</div>
        )}
        <label className="field"><span>Match me with places within <b className="num">{radius}</b> miles</span>
          <input type="range" className="slider" min={5} max={500} step={5} value={radius} onChange={(e) => setRadius(+e.target.value)} /></label>
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">2</span>How you&apos;d give</h3></div>
        <div className="modes">{GIFTS.map((g) => (
          <button type="button" key={g.id} className="mode" aria-pressed={gifts.includes(g.id)}
            onClick={() => setGifts((cur) => cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id])}><b>{g.t}</b><small>{g.d}</small></button>
        ))}</div>
        <div className="row">
          <label className="field"><span>Total you hope to give <em>optional</em></span><div className="money"><input className="input" inputMode="decimal" placeholder="5,000" value={budget} onChange={(e) => setBudget(e.target.value)} /></div></label>
          <label className="field"><span>Target per child <em>optional</em></span><div className="money"><input className="input" inputMode="decimal" placeholder="25" value={perChild} onChange={(e) => setPerChild(e.target.value)} /></div></label>
        </div>
        {budgetC && kids > 0 ? <p className="hint">Your {money(budgetC)} alone would be {perChildFmt(budgetC / kids)} per child across {fmt(kids)} kids in your places. Pooling with others raises that.</p> : null}
        <p className="hint">Stock gifts go to the partner charity, which can pass shares on to Treasury. Contributed stock must be publicly traded shares of a U.S. company, and it can't be sold until 5 years pass or the child turns 18, whichever comes first.</p>
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">3</span>Which kids</h3></div>
        <p className="hint">Treasury lets a contribution target kids by <b>where they live</b> and <b>birth year (age)</b> only. It can&apos;t be limited by income, race, gender or need. You can still focus on lower-income <i>areas</i> below.</p>
        <div className="seg" role="group" aria-label="Age group" style={{ flexWrap: "wrap" }}>
          {AGES.map((a) => <button type="button" key={a.label} aria-pressed={age.min === a.min && age.max === a.max} onClick={() => setAge({ min: a.min, max: a.max })}>{a.label}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Area income focus" style={{ flexWrap: "wrap" }}>
          <button type="button" aria-pressed={income === "any"} onClick={() => setIncome("any")}>Any area</button>
          <button type="button" aria-pressed={income === "below_threshold"} onClick={() => setIncome("below_threshold")}>Areas under ${fmt(incomeLine)} median income</button>
          <button type="button" aria-pressed={income === "lowest"} onClick={() => setIncome("lowest")}>Lowest-income areas first</button>
        </div>
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">4</span>Matching</h3></div>
        <label className="check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /><span>Show me to other givers in their match deck (name, city, places, $ per child and how you give; never your email until you both match)</span></label>
        <label className="field"><span>A line about you <em>optional</em></span><input className="input" maxLength={280} placeholder="Grew up in Canarsie, giving back to my old neighborhood" value={bio} onChange={(e) => setBio(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        {saved && !welcome && <p className="notice"><b>Saved.</b> Your match deck is updated.</p>}
        <button className="btn btn-green submit" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : welcome ? "Save and see matches" : "Save profile"}</button>
      </section>
    </div>
  );
}

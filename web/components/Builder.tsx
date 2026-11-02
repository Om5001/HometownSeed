"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ZipSearch } from "./ZipSearch";
import { AreaMap } from "./AreaMap";
import { MatchCard } from "./MatchCard";
import type { Match, Rules, ZipRow } from "@/lib/queries";
import type { User } from "@/lib/auth";
import { fmt, money, perChild, placeLabel } from "@/lib/format";

type Z = ZipRow & { suggested?: boolean };
type Area = { kids_in_class: number; kids_u18: number; meets_min: boolean; all_low_income: boolean; missing: string[] } | null;
const AGES: { label: string; min: number; max: number }[] = [
  { label: "All kids under 18", min: 0, max: 17 }, { label: "Ages 0–5", min: 0, max: 5 },
  { label: "Ages 6–12", min: 6, max: 12 }, { label: "Ages 13–17", min: 13, max: 17 },
];
const MODES = [
  { id: "match", t: "Match me with others", d: "We suggest campaigns to pool with so your area reaches the minimums faster." },
  { id: "friends", t: "Invite friends", d: "Get a link to bring friends in as co-organizers. You can still pool later." },
  { id: "solo", t: "Run it on my own", d: "Your campaign stays independent. Others can still give to it." },
] as const;

export function Builder({ user, rules, initial }: { user: User | null; rules: Rules; initial: ZipRow[] }) {
  const router = useRouter();
  const [zips, setZips] = useState<Z[]>(initial);
  const [age, setAge] = useState({ min: 0, max: 17 });
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<"match" | "friends" | "solo">("match");
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const [area, setArea] = useState<Area>(null); const [nearby, setNearby] = useState<(ZipRow & { miles?: number })[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [email, setEmail] = useState(""); const [you, setYou] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const goalCents = Math.round((Number(goal.replace(/[^0-9.]/g, "")) || 0) * 100);
  const codes = useMemo(() => zips.map((z) => z.zcta), [zips]);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!codes.length) { setArea(null); setNearby([]); return; }
    let alive = true;
    fetch("/api/area", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ zips: codes, minAge: age.min, maxAge: age.max }) })
      .then((r) => r.json()).then((d) => {
        if (!alive) return;
        setArea(d.area); setNearby(d.nearby || []);
        const byZ = new Map<string, ZipRow>(d.zips.map((z: ZipRow) => [z.zcta, z]));
        setZips((cur) => cur.map((z) => ({ ...z, ...byZ.get(z.zcta) })));
      });
    return () => { alive = false; };
  }, [codes.join(","), age.min, age.max]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(t.current);
    if (!codes.length) { setMatches([]); return; }
    t.current = setTimeout(() => {
      fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ zips: codes, goalCents, minAge: age.min, maxAge: age.max }) })
        .then((r) => r.json()).then((m) => setMatches(Array.isArray(m) ? m : []));
    }, 400);
  }, [codes.join(","), goalCents, age.min, age.max]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (z: ZipRow, suggested = false) => setZips((cur) => cur.some((c) => c.zcta === z.zcta) ? cur : [...cur, { ...z, suggested }]);
  const remove = (zcta: string) => setZips((cur) => cur.filter((z) => z.zcta !== zcta));
  const kids = area?.kids_in_class ?? 0, kidsAll = area?.kids_u18 ?? 0;
  const minTotal = kids * rules.min_per_child_cents;
  const pc = kids ? goalCents / kids : 0;
  const custom = !AGES.some((a) => a.min === age.min && a.max === age.max);

  const publish = async () => {
    setErr("");
    if (!codes.length) return setErr("Add at least one ZIP code.");
    if (goalCents < 10000) return setErr("Set a goal of at least $100.");
    if (name.trim().length < 3) return setErr("Give your campaign a name.");
    setBusy(true);
    try {
      if (!user) {
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name: you }) });
        if (!r.ok) { setErr((await r.json()).error); return; }
      }
      const r = await fetch("/api/campaigns", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: desc, zips: codes, suggestedZips: zips.filter((z) => z.suggested).map((z) => z.zcta), goalCents, minAge: age.min, maxAge: age.max, mode }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error); return; }
      router.push(`/c/${d.slug}?new=1`);
    } finally { setBusy(false); }
  };

  return (
    <div className="builder">
      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">1</span>Places</h3>{kidsAll > 0 && <span className="eyebrow">{fmt(kidsAll)} kids under 18</span>}</div>
        <p className="hint">Add ZIP codes or cities from anywhere. An area needs {fmt(rules.min_beneficiaries)} kids to qualify; if yours is smaller, add neighbors below or pool with another campaign later.</p>
        <ZipSearch onPick={(h) => add(h as ZipRow)} placeholder="ZIP code or city, like Fresno, CA" button="Add" mini />
        {zips.length > 0 && (
          <>
            <div className="zchips">
              {zips.map((z) => (
                <span key={z.zcta} className={"zchip" + (z.suggested ? " sug" : "")}>
                  <span><span className="num">{z.zcta}</span> {placeLabel(z)}</span><span className="num">{fmt(z.kids_u18)}</span>
                  <button type="button" aria-label={`Remove ${z.zcta}`} onClick={() => remove(z.zcta)}>×</button>
                </span>
              ))}
            </div>
            <div className={"meter" + (area?.meets_min ? " ok" : "")}>
              <div className="bar"><span style={{ width: Math.min(100, (kidsAll / rules.min_beneficiaries) * 100) + "%" }} /></div>
              <div className="meter-row">
                <span>{area?.meets_min ? <b>Meets the {fmt(rules.min_beneficiaries)}-kid minimum</b> : <><b>{fmt(Math.max(0, rules.min_beneficiaries - kidsAll))}</b> more kids needed to qualify on its own</>}</span>
                <span>{fmt(kidsAll)} / {fmt(rules.min_beneficiaries)}</span>
              </div>
            </div>
            <AreaMap zips={zips.filter((z) => !z.suggested).map((z) => z.zcta)} secondary={zips.filter((z) => z.suggested).map((z) => z.zcta)} label="Map of the ZIP codes you picked" />
            {nearby.length > 0 && (
              <div>
                <p className="small muted" style={{ marginBottom: 8 }}>{area?.meets_min ? "Nearby ZIPs you could include:" : "Add neighbors to reach the minimum:"}</p>
                <div className="chips">
                  {nearby.slice(0, 6).map((n) => (
                    <button type="button" key={n.zcta} className="chip-btn" onClick={() => add(n, true)}>
                      <span className="num">+{n.zcta}</span>{placeLabel(n)} · {fmt(n.kids_u18)} kids
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">2</span>Which kids</h3></div>
        <p className="hint">Treasury defines who receives a contribution by place and, optionally, by birth year. Most campaigns fund every child under 18.</p>
        <div className="seg" role="group" aria-label="Age group" style={{ flexWrap: "wrap" }}>
          {AGES.map((a) => (
            <button type="button" key={a.label} aria-pressed={age.min === a.min && age.max === a.max} onClick={() => setAge({ min: a.min, max: a.max })}>{a.label}</button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => setAge({ min: 2, max: 8 })}>Custom</button>
        </div>
        {custom && (
          <div className="age-pick small">Ages
            <select className="input" value={age.min} onChange={(e) => setAge({ min: +e.target.value, max: Math.max(+e.target.value, age.max) })}>{Array.from({ length: 18 }, (_, i) => <option key={i}>{i}</option>)}</select>
            to
            <select className="input" value={age.max} onChange={(e) => setAge({ min: Math.min(age.min, +e.target.value), max: +e.target.value })}>{Array.from({ length: 18 }, (_, i) => <option key={i}>{i}</option>)}</select>
          </div>
        )}
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">3</span>Goal</h3></div>
        <div className="money"><input className="input" inputMode="decimal" placeholder="250,000" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Goal in dollars" /></div>
        {kids > 0 && (
          <div className="chips">
            {[25, 50, 100, 250].map((d) => (
              <button type="button" key={d} className="chip-btn" onClick={() => setGoal(String(Math.ceil((kids * d) / 100) * 100))}>${d} per child · {money(Math.ceil((kids * d) / 100) * 10000)}</button>
            ))}
          </div>
        )}
        <div className="pcbox">
          <div><span className="num">{kids ? perChild(pc) : "—"}</span><small>goal per child</small></div>
          <div><span className="num">{fmt(kids)}</span><small>estimated kids who&apos;d receive it</small></div>
          <div><span className="num">{kids ? money(minTotal) : "—"}</span><small>Treasury minimum (${(rules.min_per_child_cents / 100).toFixed(0)}/child)</small></div>
        </div>
        {kids > 0 && goalCents > 0 && goalCents < minTotal && (
          <p className="notice"><b>Below the ${(rules.min_per_child_cents / 100).toFixed(0)}-per-child minimum.</b> That&apos;s fine to start: pool with campaigns below to combine money, or raise your goal to {money(minTotal)}.</p>
        )}
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">4</span>How do you want to run it?</h3></div>
        <div className="modes">
          {MODES.map((m) => (
            <button type="button" key={m.id} className="mode" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}><b>{m.t}</b><small>{m.d}</small></button>
          ))}
        </div>
        {codes.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="split" style={{ marginBottom: 10 }}><b>{matches.length ? "Already raising for kids like yours" : "No similar campaigns yet"}</b><span className="small muted">Ranked by $ per child, shared ZIPs, and distance</span></div>
            {matches.length > 0 ? (
              <div className="mcards">{matches.map((m) => <MatchCard key={m.campaign_id} m={m} rules={rules} />)}</div>
            ) : <p className="empty">You&apos;d be the first here. Others who start nearby or at a similar amount per child will be matched with you.</p>}
            {matches.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>You can give to any of these directly, or publish yours and request to pool from your campaign page.</p>}
          </div>
        )}
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">5</span>Name it</h3></div>
        <input className="input" maxLength={80} placeholder="Give it a name, like Marine Park Kids Fund" value={name} onChange={(e) => setName(e.target.value)} aria-label="Campaign name" />
        <label className="field"><span>Description <em>optional</em></span><textarea className="input" maxLength={500} placeholder="Why these places matter to you" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        {!user && (
          <div className="row">
            <label className="field"><span>Your name</span><input className="input" value={you} onChange={(e) => setYou(e.target.value)} autoComplete="name" /></label>
            <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          </div>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-green submit" type="button" disabled={busy} onClick={publish}>{busy ? "Publishing…" : "Publish campaign"}</button>
        {!user && <p className="small muted">Already have an account? <Link href="/signin?next=/start">Sign in</Link></p>}
      </section>
    </div>
  );
}

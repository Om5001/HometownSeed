"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ZipSearch } from "./ZipSearch";
import { AreaMap } from "./AreaMap";
import { MatchCard } from "./MatchCard";
import type { Match, Rules, ZipRow } from "@/lib/queries";
import { fmt, money, perChild, placeLabel } from "@/lib/format";

type Z = ZipRow & { suggested?: boolean };
type Area = { kids_in_class: number; kids_u18: number; meets_min: boolean; all_low_income: boolean; missing: string[] } | null;
const AGES: { label: string; min: number; max: number }[] = [
  { label: "All kids under 18", min: 0, max: 17 }, { label: "Ages 0–5", min: 0, max: 5 },
  { label: "Ages 6–12", min: 6, max: 12 }, { label: "Ages 13–17", min: 13, max: 17 },
];
const GOALS = [
  { id: "total", t: "Total amount" }, { id: "per_child", t: "Amount per child" }, { id: "open", t: "No set goal, just raise" },
] as const;

export function Builder({ rules, initial, partner, initialAge }: {
  rules: Rules; initial: ZipRow[]; partner?: { id: string; name: string; email: string } | null; initialAge?: { min: number; max: number };
}) {
  const router = useRouter();
  const [zips, setZips] = useState<Z[]>(initial);
  const [age, setAge] = useState(initialAge ?? { min: 0, max: 17 });
  const [goalType, setGoalType] = useState<"total" | "per_child" | "open">("total");
  const [goal, setGoal] = useState(""); const [goalPc, setGoalPc] = useState("");
  const [matching, setMatching] = useState(true); const [friends, setFriends] = useState(false);
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const [area, setArea] = useState<Area>(null); const [nearby, setNearby] = useState<(ZipRow & { miles?: number })[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const cents = (v: string) => Math.round((Number(v.replace(/[^0-9.]/g, "")) || 0) * 100);
  const pcInput = cents(goalPc);
  const codes = useMemo(() => zips.map((z) => z.zcta), [zips]);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const kidsNow = area?.kids_in_class ?? 0;
  const matchGoal = goalType === "total" ? cents(goal) : goalType === "per_child" ? Math.round(pcInput * kidsNow) : 0;

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
      fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ zips: codes, goalCents: matchGoal, minAge: age.min, maxAge: age.max }) })
        .then((r) => r.json()).then((m) => setMatches(Array.isArray(m) ? m : []));
    }, 400);
  }, [codes.join(","), matchGoal, age.min, age.max]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (z: ZipRow, suggested = false) => setZips((cur) => cur.some((c) => c.zcta === z.zcta) ? cur : [...cur, { ...z, suggested }]);
  const remove = (zcta: string) => setZips((cur) => cur.filter((z) => z.zcta !== zcta));
  const kids = area?.kids_in_class ?? 0, kidsAll = area?.kids_u18 ?? 0;
  const minTotal = kids * rules.min_per_child_cents;
  // Whichever way the goal is entered, show both the total and the per-child amount.
  const goalCents = goalType === "total" ? cents(goal) : goalType === "per_child" ? Math.round(pcInput * kids) : 0;
  const pc = goalType === "per_child" ? pcInput : kids ? goalCents / kids : 0;
  const custom = !AGES.some((a) => a.min === age.min && a.max === age.max);

  const publish = async () => {
    setErr("");
    if (!codes.length) return setErr("Add at least one ZIP code.");
    if (goalType === "total" && goalCents < 10000) return setErr("Set a goal of at least $100, or pick another goal type.");
    if (goalType === "per_child" && pcInput < 1) return setErr("Set an amount per child.");
    if (name.trim().length < 3) return setErr("Give your campaign a name.");
    setBusy(true);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: desc, zips: codes, suggestedZips: zips.filter((z) => z.suggested).map((z) => z.zcta), goalType, goalCents: goalType === "total" ? goalCents : undefined, goalPerChildCents: goalType === "per_child" ? pcInput : undefined, minAge: age.min, maxAge: age.max, openToMatching: matching, inviteFriends: friends }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error); return; }
      if (partner) {
        await fetch(`/api/campaigns/${d.slug}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails: [partner.email] }) });
      }
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
                <span>{area?.meets_min ? <b>Meets the {fmt(rules.min_beneficiaries)}-kid requirement</b> : <><b>{fmt(Math.max(0, rules.min_beneficiaries - kidsAll))}</b> more kids needed to qualify on its own</>}</span>
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
        <div className="seg" role="group" aria-label="Goal type" style={{ flexWrap: "wrap" }}>
          {GOALS.map((g) => <button type="button" key={g.id} aria-pressed={goalType === g.id} onClick={() => setGoalType(g.id)}>{g.t}</button>)}
        </div>
        {goalType === "total" && (<>
          <div className="money"><input className="input" inputMode="decimal" placeholder="250,000" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Goal in dollars" /></div>
          {kids > 0 && (
            <div className="chips">
              {[25, 50, 100, 250].map((d) => (
                <button type="button" key={d} className="chip-btn" onClick={() => setGoal(String(Math.ceil((kids * d) / 100) * 100))}>${d} per child · {money(Math.ceil((kids * d) / 100) * 10000)}</button>
              ))}
            </div>
          )}
        </>)}
        {goalType === "per_child" && (<>
          <div className="money"><input className="input" inputMode="decimal" placeholder="25" value={goalPc} onChange={(e) => setGoalPc(e.target.value)} aria-label="Goal per child in dollars" /></div>
          <div className="chips">{[25, 50, 100, 250].map((d) => <button type="button" key={d} className="chip-btn" onClick={() => setGoalPc(String(d))}>${d} per child</button>)}</div>
          <p className="hint">The total follows the number of kids: {kids ? <b>{money(goalCents)}</b> : "add places to see it"}{kids ? ` for ${fmt(kids)} kids` : ""}. If you add ZIP codes later, the total grows with them.</p>
        </>)}
        {goalType === "open" && <p className="hint">No target: every pledge counts, and your page shows the total and the amount per child so far.</p>}
        <div className="pcbox">
          <div><span className="num">{goalType === "open" ? "Open" : kids ? perChild(pc) : "—"}</span><small>{goalType === "per_child" ? `total ${kids ? money(goalCents) : "—"}` : "goal per child"}</small></div>
          <div><span className="num">{fmt(kids)}</span><small>estimated kids who&apos;d receive it</small></div>
          <div><span className="num">{kids ? money(minTotal) : "—"}</span><small>Treasury guidance (${(rules.min_per_child_cents / 100).toFixed(0)}/child)</small></div>
        </div>
        {kids > 0 && goalCents > 0 && goalCents < minTotal && (
          <p className="notice"><b>Below Treasury&apos;s ${(rules.min_per_child_cents / 100).toFixed(0)}-per-child guidance.</b> Only the 5,000-kid area is required by law, but IRS guidance for 2026–2027 applications asks for at least ${(rules.min_per_child_cents / 100).toFixed(0)} per child. Pool with campaigns below or raise your goal to {money(minTotal)}.</p>
        )}
      </section>

      <section className="panel bstep">
        <div className="subhead"><h3><span className="n">4</span>How do you want to run it?</h3></div>
        <p className="hint">Pick one, both, or neither.</p>
        <div className="modes two">
          <button type="button" className="mode" aria-pressed={matching} onClick={() => setMatching(!matching)}><b>{matching ? "✓ " : ""}Match me with others</b><small>Show up in matching, and pool with campaigns funding the same kids or at a similar amount per child.</small></button>
          <button type="button" className="mode" aria-pressed={friends} onClick={() => setFriends(!friends)}><b>{friends ? "✓ " : ""}Invite friends</b><small>Get a link that brings friends in as co-organizers.</small></button>
        </div>
        <p className="small muted">{!matching && !friends ? "Running it on your own: your campaign stays independent, and anyone can still give to it." : matching && friends ? "Matching and friend invites are both on." : matching ? "Matching is on." : "Friend invites are on; matching is off."} You can change this later.</p>
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
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-green submit" type="button" disabled={busy} onClick={publish}>{busy ? "Publishing…" : "Publish campaign"}</button>
      </section>
    </div>
  );
}

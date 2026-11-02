"use client";
import Link from "next/link";
import type { Match, Rules } from "@/lib/queries";
import { fmt, moneyC, perChild } from "@/lib/format";

const TYPE: Record<Match["match_type"], [string, string]> = {
  same_area: ["Same kids", "g"], nearby: ["Nearby", "b"], similar_goal: ["Similar $ per child", "o"],
};

export function MatchCard({ m, rules, action }: { m: Match; rules: Rules; action?: React.ReactNode }) {
  const [label, cls] = TYPE[m.match_type];
  return (
    <div className="mcard">
      <div className="top-line">
        <Link href={`/c/${m.slug}`} target="_blank">{m.name}</Link>
        <span className={"tag " + cls}>{label} · {Math.round(m.score * 100)}% match</span>
      </div>
      <div className="stats3">
        <span><b>{perChild(m.their_goal_per_child)}</b> goal/child{m.my_goal_per_child ? <> (yours {perChild(m.my_goal_per_child)})</> : null}</span>
        {m.raised !== undefined && <span><b>{moneyC(m.raised)}</b> {m.goal ? `of ${moneyC(m.goal)}` : "raised, open goal"}</span>}
        <span><b>{fmt(m.combined_kids_u18)}</b> kids together{m.combined_kids_u18 >= rules.min_beneficiaries ? " ✓" : ""}</span>
      </div>
      <div className="tags">{m.reasons.map((r) => <span key={r} className="tag">{r}</span>)}</div>
      {action && <div className="acts">{action}</div>}
    </div>
  );
}

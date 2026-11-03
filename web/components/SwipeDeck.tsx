"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DeckCard } from "@/lib/queries";
import { ageLabel, fmt, initials, moneyC, perChild } from "@/lib/format";
import { MessageButton } from "./Messaging";

const GIFT: Record<string, string> = { cash: "Cash", stock: "Stock", daf: "DAF" };

async function send(method: "POST" | "DELETE", body: object) {
  const r = await fetch("/api/swipes", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.ok ? r.json() : { matched: false };
}

export function SwipeDeck({ initial }: { initial: DeckCard[] }) {
  const [cards, setCards] = useState(initial);
  const [last, setLast] = useState<DeckCard | null>(null);
  const [drag, setDrag] = useState({ x: 0, active: false });
  const [fly, setFly] = useState<0 | 1 | -1>(0);
  const [match, setMatch] = useState<DeckCard | null>(null);
  const [note, setNote] = useState("");
  const start = useRef<number | null>(null);
  const top = cards[0];

  const decide = useCallback(async (like: boolean) => {
    if (!top || fly) return;
    setFly(like ? 1 : -1);
    const card = top;
    const res = await send("POST", { kind: card.kind, id: card.id, decision: like ? "like" : "pass" });
    setTimeout(() => {
      setCards((c) => c.slice(1)); setLast(card); setFly(0); setDrag({ x: 0, active: false });
      if (res.matched) setMatch(card);
      else if (like) setNote(`Saved ${card.title}. You can message them any time from Saved.`);
      else setNote("");
    }, 220);
  }, [top, fly]);

  const undo = async () => {
    if (!last) return;
    await send("DELETE", { kind: last.kind, id: last.id });
    setCards((c) => [last, ...c]); setLast(null); setNote("");
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowRight") decide(true);
      if (e.key === "ArrowLeft") decide(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [decide]);

  const onDown = (e: React.PointerEvent) => { if ((e.target as HTMLElement).closest("a,button,textarea,input")) return; start.current = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag({ x: 0, active: true }); };
  const onMove = (e: React.PointerEvent) => { if (start.current !== null) setDrag({ x: e.clientX - start.current, active: true }); };
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag.x > 110) decide(true); else if (drag.x < -110) decide(false); else setDrag({ x: 0, active: false });
  };

  const x = fly ? fly * 700 : drag.x;
  return (
    <div className="deck-wrap">
      {match && (
        <div className="deck-match" role="dialog" aria-label="Mutual interest">
          <div className="panel stack" style={{ textAlign: "center", alignItems: "center" }}>
            <div className="ring">✓</div>
            <h2>You saved each other</h2>
            <p className="lede2">You and {match.title} are both interested in giving together. Send a message to plan a campaign or pool.</p>
            <div className="acts" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <MessageButton to={match.id} name={match.title} label={`Message ${match.title.split(" ")[0]}`} className="btn btn-green" />
              <button className="btn btn-ghost" onClick={() => setMatch(null)}>Keep reviewing</button>
            </div>
          </div>
        </div>
      )}
      <div className="deck">
        {cards.slice(0, 3).reverse().map((c, i, arr) => {
          const isTop = i === arr.length - 1, depth = arr.length - 1 - i;
          const style: React.CSSProperties = isTop
            ? { transform: `translateX(${x}px) rotate(${x / 22}deg)`, transition: drag.active ? "none" : "transform .22s ease" }
            : { transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`, opacity: 1 - depth * 0.25 };
          return (
            <article key={c.kind + c.id} className={"dcard" + (isTop ? " top" : "")} style={style}
              onPointerDown={isTop ? onDown : undefined} onPointerMove={isTop ? onMove : undefined} onPointerUp={isTop ? onUp : undefined} onPointerCancel={isTop ? onUp : undefined}>
              {isTop && x > 40 && <span className="stamp like">SAVE</span>}
              {isTop && x < -40 && <span className="stamp pass">PASS</span>}
              <div className="split">
                <span className={"tag " + (c.kind === "campaign" ? "g" : "b")}>{c.kind === "campaign" ? "Campaign" : "Giver"}</span>
                <span className="tag">{Math.round(c.score * 100)}% fit</span>
              </div>
              <div className="dhead">
                <span className={"mono-tile " + (c.kind === "campaign" ? "t0" : "t1")}>{initials(c.title)}</span>
                <div style={{ minWidth: 0 }}><h3>{c.title}</h3><p className="muted small">{c.subtitle}</p>{c.nonprofit && <span className="np-badge" title="Represents a 501(c)(3)">✓ 501(c)(3): {c.nonprofit}</span>}</div>
              </div>
              <div className="dstats">
                <div><span className="num">{c.miles === null ? "—" : c.miles < 1 ? "<1" : fmt(c.miles)}</span><small>miles away</small></div>
                <div><span className="num">{c.per_child_cents ? perChild(c.per_child_cents) : "—"}</span><small>{c.kind === "campaign" ? "goal per child" : "per child"}</small></div>
                {c.kind === "campaign"
                  ? <div><span className="num">{fmt(c.kids)}</span><small>kids · {moneyC(c.raised_cents)} {c.goal_cents ? `of ${moneyC(c.goal_cents)}` : "raised"}</small></div>
                  : <div><span className="num">{c.goal_cents ? moneyC(c.goal_cents) : "—"}</span><small>hopes to give</small></div>}
              </div>
              <div className="tags">
                {c.reasons.map((r) => <span key={r} className="tag g">{r}</span>)}
                <span className="tag">{ageLabel(c.min_age, c.max_age)}</span>
                {c.kind === "person" && c.gift_types.map((g) => <span key={g} className="tag">{GIFT[g] ?? g}</span>)}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {isTop && <MessageButton to={c.kind === "person" ? c.id : undefined} campaign={c.kind === "campaign" ? c.slug ?? undefined : undefined}
                  name={c.kind === "campaign" ? `${c.title}'s organizer` : c.title} label={c.kind === "campaign" ? "Message organizer" : "Message"} />}
                {c.kind === "campaign" && c.slug && <Link className="small" href={`/c/${c.slug}`} target="_blank">Open campaign page ↗</Link>}
              </div>
            </article>
          );
        })}
        {!top && (
          <div className="dcard empty-deck">
            <h3>You&apos;re all caught up</h3>
            <p className="muted">New campaigns and givers near your places will show up here. Widen your radius or add places to see more.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-green btn-sm" href="/account#giving">Edit profile</Link><Link className="btn btn-ghost btn-sm" href="/start">Start a campaign</Link></div>
          </div>
        )}
      </div>
      {top && (
        <div className="deck-btns">
          <button className="dbtn pass" aria-label="Not now" onClick={() => decide(false)}>✕</button>
          <button className="dbtn undo" aria-label="Undo last" disabled={!last} onClick={undo}>↺</button>
          <button className="dbtn like" aria-label="Save" onClick={() => decide(true)}>★</button>
        </div>
      )}
      <p className="small muted" style={{ textAlign: "center", minHeight: 20 }} aria-live="polite">{note || (top ? "Tip: use ← and → keys" : "")}</p>
    </div>
  );
}

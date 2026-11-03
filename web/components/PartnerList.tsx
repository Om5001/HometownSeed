"use client";
import { useState } from "react";
import Link from "next/link";
import type { DeckCard } from "@/lib/queries";
import { ageLabel, fmt, initials, moneyC, perChild } from "@/lib/format";
import { MessageButton } from "./Messaging";
import { SwipeDeck } from "./SwipeDeck";

const GIFT: Record<string, string> = { cash: "Cash", stock: "Stock", daf: "DAF" };
type Filter = "all" | "campaign" | "person" | "nonprofit";

async function swipe(kind: string, id: string, decision: "like" | "pass") {
  await fetch("/api/swipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, decision }) });
}

/** Find partners: a ranked list you can message, save, pool with, or skip. "Quick review" is the swipe deck. */
export function PartnerList({ initial, mine }: { initial: DeckCard[]; mine: { slug: string; name: string }[] }) {
  const [cards, setCards] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"list" | "quick">("list");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<Record<string, string>>({});
  const shown = cards.filter((c) => filter === "all" || (filter === "nonprofit" ? !!c.nonprofit : c.kind === filter));
  const counts = { all: cards.length, campaign: cards.filter((c) => c.kind === "campaign").length, person: cards.filter((c) => c.kind === "person").length, nonprofit: cards.filter((c) => c.nonprofit).length };

  const save = async (c: DeckCard) => { await swipe(c.kind, c.id, "like"); setSaved((s) => new Set(s).add(c.kind + c.id)); };
  const skip = async (c: DeckCard) => { await swipe(c.kind, c.id, "pass"); setCards((x) => x.filter((y) => !(y.kind === c.kind && y.id === c.id))); };
  const pool = async (c: DeckCard, from: string) => {
    const r = await fetch(`/api/campaigns/${from}/pool-requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toSlug: c.slug }) });
    const d = await r.json().catch(() => ({}));
    setNote((n) => ({ ...n, [c.id]: r.ok ? "Pool request sent. They'll see it on their campaign page." : d.error || "Couldn't send the request." }));
  };

  return (
    <div>
      <div className="split" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="pfilters" role="group" aria-label="Show">
          {(["all", "campaign", "person", "nonprofit"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {{ all: "All", campaign: "Campaigns", person: "People", nonprofit: "Nonprofit reps" }[f]} <span className="muted">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          <button type="button" aria-pressed={view === "quick"} onClick={() => setView("quick")}>Quick review</button>
        </div>
      </div>

      {view === "quick" ? <SwipeDeck key={filter} initial={shown} /> : shown.length === 0 ? (
        <p className="empty">Nothing here yet. Widen your distance or add places on your <Link href="/account#giving">profile</Link>, or check back as more people join.</p>
      ) : (
        <div className="plist">{shown.map((c) => {
          const isSaved = saved.has(c.kind + c.id);
          return (
            <article className="pcard" key={c.kind + c.id}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className={"mono-tile " + (c.kind === "campaign" ? "t0" : "t1")}>{initials(c.title)}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{c.kind === "campaign" && c.slug ? <Link href={`/c/${c.slug}`}>{c.title}</Link> : c.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{c.kind === "campaign" ? "Campaign" : "Giver"} · {c.subtitle}{c.miles !== null ? ` · ${Math.round(c.miles)} mi` : ""}</p>
                </div>
              </div>
              {c.nonprofit && <span className="np-badge" style={{ alignSelf: "flex-start" }}>✓ 501(c)(3): {c.nonprofit}</span>}
              <div className="small">
                {c.kind === "campaign"
                  ? <>{c.per_child_cents ? `${perChild(c.per_child_cents)} goal per child` : "Open goal"} · {fmt(c.kids ?? 0)} kids · {moneyC(c.raised_cents ?? 0)} pledged</>
                  : <>{c.per_child_cents ? `${perChild(c.per_child_cents)} per child` : "Flexible amount"} · {ageLabel(c.min_age, c.max_age)} · {c.gift_types.map((g) => GIFT[g] ?? g).join(", ")}</>}
              </div>
              {c.reasons.length > 0 && <div className="why">{c.reasons.slice(0, 3).map((r) => <span key={r} className="tag g">{r}</span>)}</div>}
              <div className="acts">
                <MessageButton to={c.kind === "person" ? c.id : undefined} campaign={c.kind === "campaign" ? c.slug ?? undefined : undefined}
                  name={c.kind === "campaign" ? `${c.title}'s organizer` : c.title} label={c.kind === "campaign" ? "Message organizer" : "Message"} className="btn btn-green btn-sm" />
                {c.kind === "campaign" && mine.length > 0 && (
                  <PoolPicker mine={mine} onPick={(from) => pool(c, from)} />
                )}
                <button className="btn btn-ghost btn-sm" disabled={isSaved} onClick={() => save(c)}>{isSaved ? "Saved ✓" : "Save"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => skip(c)} title="Hide this suggestion">Not now</button>
              </div>
              {note[c.id] && <p className="small muted">{note[c.id]}</p>}
            </article>
          );
        })}</div>
      )}
    </div>
  );
}

function PoolPicker({ mine, onPick }: { mine: { slug: string; name: string }[]; onPick: (slug: string) => void }) {
  const [open, setOpen] = useState(false); const [slug, setSlug] = useState(mine[0].slug);
  if (!open) return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Request to pool</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {mine.length > 1 && <select className="input" style={{ width: "auto", padding: "6px 8px" }} value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Pool which of your campaigns">
        {mine.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</select>}
      <button className="btn btn-green btn-sm" onClick={() => { onPick(slug); setOpen(false); }}>Send request{mine.length === 1 ? ` from ${mine[0].name}` : ""}</button>
    </span>
  );
}

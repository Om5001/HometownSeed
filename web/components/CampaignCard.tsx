import Link from "next/link";
import type { CampaignRow } from "@/lib/queries";
import { ago, fmt, initials, moneyC } from "@/lib/format";

const tone = (id: string) => "t" + (parseInt(id.replace(/-/g, "").slice(0, 6), 16) % 4);

export function CampaignCard({ c }: { c: CampaignRow }) {
  const pct = c.goal ? Math.min(1, c.raised / c.goal) : 0;
  return (
    <article className="ccard camp" style={{ padding: 0, position: "relative" }}>
      <Link className="cc-main" href={`/c/${c.slug}`} style={{ textDecoration: "none" }}>
        <div className="cc-top">
          <span className={"mono-tile " + tone(c.id)}>{initials(c.name)}</span>
          <div style={{ minWidth: 0 }}><b className="cc-name">{c.name}</b><small>by {c.owner_name}{c.is_demo ? " · demo" : ""}</small></div>
        </div>
        <p className="cc-places">{c.places.slice(0, 2).join(" · ")}{c.places.length > 2 ? ` + ${c.zip_count - 2} more` : ""}</p>
        <div className="bar"><span style={{ width: (pct * 100).toFixed(1) + "%" }} /></div>
        <div className="meta"><span><b className="num">{moneyC(c.raised)}</b> of {moneyC(c.goal)}</span><span><b>{Math.floor(pct * 100)}%</b></span></div>
        <div className="meta">
          <span>{fmt(c.kids)} kids · {c.zip_count} ZIP{c.zip_count === 1 ? "" : "s"}</span>
          <span>{c.pool_id ? "Pooled" : c.meets_min ? "5,000+ kids" : "Building"} · {ago(c.created_at)}</span>
        </div>
      </Link>
    </article>
  );
}

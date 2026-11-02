import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { findMatches, getCampaign, getRules, memberRole } from "@/lib/queries";
import { ageLabel, ago, fmt, initials, money, moneyC, perChild, placeLabel } from "@/lib/format";
import { AreaMap } from "@/components/AreaMap";
import { MatchCard } from "@/components/MatchCard";
import { CampaignSettings, InvitePanel, PledgeForm, PoolButton, RequestButtons, ShareButton } from "@/components/CampaignActions";
import { Tracker } from "@/components/Tracker";
import { coalitionState } from "@/lib/coalition";

export const dynamic = "force-dynamic";

type Pool = { id: string; name: string; zip_count: number; kids: number; kids_u18: number; meets_min: boolean; raised: number; goal: number; raised_pc: number; campaigns: { slug: string; name: string }[] };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ new?: string }> }) {
  const { slug } = await params; const { new: isNew } = await searchParams;
  const data = await getCampaign(slug);
  if (!data) notFound();
  const { campaign: c, zips, pledges, team, incoming, outgoing } = data;
  const pool = data.pool as Pool | null;
  const [user, rules] = await Promise.all([getUser(), getRules()]);
  const role = await memberRole(c.id, user?.id);
  const [matches, st] = await Promise.all([
    findMatches(zips.map((z) => z.zcta), c.goal ?? 0, c.min_age, c.max_age, c.id, 6),
    coalitionState(c),
  ]);
  const pendingTo = new Set(outgoing.map((o) => o.to_campaign));

  // Treasury readiness is judged on the pool when pooled, otherwise on this campaign.
  const unit = pool ? { kids: pool.kids, kids_u18: pool.kids_u18, raised: pool.raised, meets: pool.meets_min } : { kids: c.kids, kids_u18: c.kids_u18, raised: c.raised, meets: c.meets_min };
  const minTotal = unit.kids * rules.min_per_child_cents;
  const perKidOk = unit.kids > 0 && unit.raised >= minTotal;
  const pct = c.goal ? Math.min(1, c.raised / c.goal) : 0;
  const where = zips.length === 1 ? placeLabel(zips[0]) : `${zips.length} ZIP codes`;

  return (
    <main>
      <div className="wrap dash-head">
        <div className="crumbs"><Link className="back" href="/#campaigns">← All campaigns</Link></div>
        {isNew && role && <p className="notice" style={{ marginBottom: 16 }}><b>Your campaign is live.</b> {c.open_to_matching ? "Check the matches below to pool with others. " : ""}{c.invite_friends ? "Grab your invite link below. " : ""}{!c.open_to_matching && !c.invite_friends ? "Share it to start collecting pledges." : ""}</p>}
        <div className="title-row">
          <div style={{ minWidth: 0 }}>
            <h1>{c.name}</h1>
            <p style={{ maxWidth: "70ch" }}>{c.description ? c.description + " " : ""}For about {fmt(c.kids)} kids ({ageLabel(c.min_age, c.max_age).toLowerCase()}) in {c.places.slice(0, 3).join(", ")}{c.zip_count > 3 ? ` and ${c.zip_count - 3} more ZIP codes` : ""}.</p>
          </div>
          <span className={"pill " + (pool ? "ok" : c.meets_min ? "ok" : "gold")}>{pool ? "Pooled" : c.meets_min ? "5,000+ kids" : "Building to 5,000"}</span>
        </div>
      </div>

      <div className="wrap grid">
        <div className="col">
          <Tracker c={c} st={st} isOrganizer={!!role} minKids={rules.min_beneficiaries} />
          <section className="panel hero-panel">
            <div className="panel-head" style={{ marginBottom: 22 }}>
              <span className="eyebrow">{[c.open_to_matching && "Open to matching", c.invite_friends && "Friends welcome"].filter(Boolean).join(" · ") || "Running on its own"} · {c.zip_count} ZIP codes</span>
              <span className="eyebrow">Started {ago(c.created_at).toLowerCase()}</span>
            </div>
            <div className="raised">
              <div><div className="big">{money(c.raised)}</div><p className="of">{c.goal ? <>pledged of a <b className="num">{money(c.goal)}</b> goal{c.goal_type === "per_child" ? ` (${perChild(c.goal_pc)} per child)` : ""}</> : "pledged so far · no set goal"}</p></div>
              {c.goal ? <div style={{ textAlign: "right" }}><div className="pct">{Math.floor(pct * 100)}%</div><p className="of">of goal</p></div> : null}
            </div>
            <div className="bar" style={{ marginTop: 16 }}><span style={{ width: (pct * 100).toFixed(1) + "%" }} /></div>
            <div className="kpis">
              <div className="kpi"><span className="num">{fmt(c.donors)}</span><small>donors</small></div>
              <div className="kpi"><span className="num">{fmt(c.kids)}</span><small>kids</small></div>
              <div className="kpi"><span className="num">{c.goal_pc ? perChild(c.goal_pc) : "Open"}</span><small>goal per kid</small></div>
              <div className="kpi"><span className="num">{perChild(c.raised_pc)}</span><small>per kid so far</small></div>
            </div>
            <div className="org">
              <span className="avstack">{team.slice(0, 4).map((t) => <span key={t.id} className="avatar av-none">{initials(t.display_name)}</span>)}</span>
              <span>Organized by <b>{team.map((t) => t.display_name).join(", ")}</b></span>
              <span className="sp"><ShareButton path={`/c/${c.slug}`} /><a className="btn btn-green btn-sm" href="#give">Pledge</a></span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><div><p className="eyebrow">Treasury readiness{pool ? " (pooled)" : ""}</p><h2 style={{ marginTop: 4 }}>Ready to send?</h2></div></div>
            <ul className="ready">
              <li><span className={"ic " + (unit.meets ? "ok" : "no")}>{unit.meets ? "✓" : "!"}</span>
                <div><b>{fmt(rules.min_beneficiaries)} or more kids in the area <span className="tag">Required by law</span></b><small>{unit.meets ? `${fmt(unit.kids_u18)} estimated account holders under 18.` : `${fmt(unit.kids_u18)} now; ${fmt(rules.min_beneficiaries - unit.kids_u18)} more needed. Add ZIPs or pool with a nearby campaign.`}</small></div></li>
              {rules.min_per_child_cents > 0 && (
              <li><span className={"ic " + (perKidOk ? "ok" : "no")}>{perKidOk ? "✓" : "i"}</span>
                <div><b>${(rules.min_per_child_cents / 100).toFixed(0)} per child <span className="tag o">Treasury guidance</span></b><small>{perKidOk ? `${perChild(unit.raised / unit.kids)} per child pledged.` : `${money(unit.raised)} of ${money(minTotal)} (${perChild(unit.kids ? unit.raised / unit.kids : 0)} per child so far). IRS Notice 2025-68 says applications in 2026–2027 need at least this; the final amount is set in Treasury's agreement.`}</small></div></li>
              )}
              <li><span className="ic no">…</span><div><b>Sent by a partner charity</b><small>Only charities, foundations, donor-advised funds and governments can make these contributions. Submission opens once a charity partner is connected.</small></div></li>
            </ul>
          </section>

          <section className="panel" id="give">
            <PledgeForm slug={c.slug} kids={c.kids} where={where} user={user} />
          </section>
        </div>

        <div className="col">
          <section className="panel">
            <div className="panel-head"><div><p className="eyebrow">Places in this campaign</p><h2 style={{ marginTop: 4 }}>{c.zip_count} ZIP code{c.zip_count === 1 ? "" : "s"}</h2></div><span className="eyebrow">{fmt(c.kids)} kids</span></div>
            <AreaMap zips={zips.map((z) => z.zcta)} label={`Map of the places in ${c.name}`} />
            <div className="mlist">
              <div className="mhead"><span>ZIP</span><span>Place</span><span>Kids</span><span>Income</span></div>
              {zips.slice(0, 12).map((z) => (
                <Link key={z.zcta} className="mrow" href={`/zip/${z.zcta}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="num">{z.zcta}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{placeLabel(z)}</span>
                  <span className="num">{fmt(z.kids_in_class)}</span><small>{z.median_hh_income ? moneyC(z.median_hh_income * 100) : "—"}</small>
                </Link>
              ))}
            </div>
          </section>

          {pool && (
            <section className="panel">
              <div className="panel-head"><div><p className="eyebrow">Pool</p><h2 style={{ marginTop: 4 }}>{pool.name}</h2></div><span className={"pill " + (pool.meets_min ? "ok" : "gold")}>{fmt(pool.kids_u18)} kids</span></div>
              <p className="hint">These campaigns send one combined contribution, split evenly across {fmt(pool.kids)} kids in {pool.zip_count} ZIP codes.</p>
              <div className="pcbox"><div><span className="num">{moneyC(pool.raised)}</span><small>pledged together</small></div><div><span className="num">{perChild(pool.raised_pc)}</span><small>per child</small></div><div><span className="num">{pool.campaigns.length}</span><small>campaigns</small></div></div>
              <ul className="small" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{pool.campaigns.map((p) => <li key={p.slug}><Link href={`/c/${p.slug}`}>{p.name}</Link></li>)}</ul>
            </section>
          )}

          {role && incoming.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Pool requests</h2></div>
              <div className="mcards">{incoming.map((r) => (
                <div className="mcard" key={r.id}><div className="top-line"><Link href={`/c/${r.slug}`}>{r.name}</Link><span className="small muted">{ago(r.created_at)}</span></div>
                  {r.message && <p className="small">{r.message}</p>}<RequestButtons id={r.id} /></div>
              ))}</div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><div><p className="eyebrow">{role ? "Matches for your campaign" : "Related campaigns"}</p><h2 style={{ marginTop: 4 }}>Pile on or pool up</h2></div></div>
            {matches.length ? (
              <div className="mcards">{matches.map((m) => (
                <MatchCard key={m.campaign_id} m={m} rules={rules} action={role && c.open_to_matching ? (
                  <PoolButton fromSlug={c.slug} toSlug={m.slug} pending={pendingTo.has(m.campaign_id)}
                    disabled={!m.same_age_class ? "Different age group" : pool && pool.campaigns.some((p) => p.slug === m.slug) ? "Already pooled" : undefined} />
                ) : undefined} />
              ))}</div>
            ) : <p className="empty">No similar campaigns yet. When someone starts one nearby or at a similar amount per child, it will show up here.</p>}
            {role && !c.open_to_matching && matches.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Matching is off for this campaign, so pooling is off. Turn it on in Settings.</p>}
          </section>

          {role && c.invite_friends && (
            <section className="panel">
              <div className="panel-head"><div><p className="eyebrow">Organize with friends</p><h2 style={{ marginTop: 4 }}>Invite co-organizers</h2></div></div>
              <InvitePanel slug={c.slug} />
            </section>
          )}
          {role && (
            <section className="panel">
              <div className="panel-head"><h2>Settings</h2></div>
              <CampaignSettings slug={c.slug} matching={c.open_to_matching} friends={c.invite_friends} />
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><h2>Recent pledges</h2><span className="eyebrow">{fmt(c.donors)} donor{c.donors === 1 ? "" : "s"}</span></div>
            <div className="feed">
              {pledges.length ? pledges.map((p) => (
                <div className="don" key={p.id}>
                  <span className="avatar av-none">{initials(p.name)}</span>
                  <div><b>{p.name}</b>{p.message && <p>{p.message}</p>}</div>
                  <span className="amt-tag">{money(p.amount)}<small>{ago(p.created_at)}</small></span>
                </div>
              )) : <p className="empty">No pledges yet. Be the first.</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

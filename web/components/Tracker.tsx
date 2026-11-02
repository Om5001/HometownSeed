import Link from "next/link";
import type { CoalitionState } from "@/lib/coalition";
import { ago, fmt, money } from "@/lib/format";
import { ConfirmCoalitionButton } from "./CampaignActions";

type C = { slug: string; created_at: string; kids_u18: number; meets_min: boolean; raised: number };

export function Tracker({ c, st, isOrganizer, minKids }: { c: C; st: CoalitionState; isOrganizer: boolean; minKids: number }) {
  const order = ["created", "coalition", "approval", "send", "done"] as const;
  const at = order.indexOf(st.stage);
  const cls = (i: number) => (i < at ? "done" : i === at ? "now" : "");
  const status = st.pool?.status ?? "none";
  const kids = st.pool?.kids_u18 ?? c.kids_u18;
  const ready = st.pool ? st.pool.meets_min : c.meets_min;
  const n = Math.max(st.campaigns.length, 1);
  const confirmed = st.campaigns.filter((x) => x.confirmed).length;
  const signedN = st.signers.filter((x) => x.signed).length, people = st.signers.length;
  const me = st.campaigns.find((x) => x.slug === c.slug);
  const step2 = at > 1 ? `${n} campaign${n > 1 ? "s" : ""} · ${people} ${people === 1 ? "person" : "people"} · agreement signed`
    : status === "confirmed" ? `Agreement: ${signedN} of ${people} people signed`
    : st.pool ? `${confirmed} of ${n} ready · ${fmt(kids)} kids` : `${fmt(kids)} of ${fmt(minKids)} kids`;
  const step3 = at > 2 ? "Treasury approved" : status === "submitted" ? "Sent, waiting on Treasury"
    : status === "rejected" ? "Not approved: revise and resend" : status === "approved" ? "Review and send the application" : "Treasury reviews the application";
  const step4 = at > 3 ? "In kids' accounts" : status === "funded" ? "Paid, Treasury distributing" : status === "accepted" ? "Send by ACH or wire" : "Hometown Seed pays Treasury";
  const href = st.pool ? `/coalitions/${st.pool.id}` : "#";
  return (
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">Progress</p><h2 style={{ marginTop: 4 }}>From pledges to kids&apos; accounts</h2></div></div>
      <ol className="tracker">
        <li className="done"><span className="dot">✓</span><div><b>Campaign created</b><small>{ago(c.created_at)}</small></div></li>
        <li className={cls(1)}><span className="dot">{at > 1 ? "✓" : 2}</span><div><b>Coalition formed</b><small>{step2}</small></div></li>
        <li className={cls(2)}><span className="dot">{at > 2 ? "✓" : 3}</span><div><b>Treasury approval</b><small>{step3}</small></div></li>
        <li className={cls(3)}><span className="dot">{at > 3 ? "✓" : 4}</span><div><b>Money sent</b><small>{step4}</small></div></li>
      </ol>

      {!isOrganizer && st.me.party && status === "confirmed" && (
        <div className="trk-action">
          <p className="small">{st.me.signed ? "You signed. Waiting for the others." : "You pledged to this coalition, so you're named in its agreement. Sign it, or leave and withdraw your pledge."}</p>
          <Link className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} href={href}>{st.me.signed ? "View the agreement" : "Review and sign, or leave"}</Link>
        </div>
      )}
      {!isOrganizer && st.me.party && !["forming", "confirmed", "none"].includes(status) && (
        <div className="trk-action"><Link className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} href={href + "#treasury"}>View the agreement and application</Link></div>
      )}
      {isOrganizer && (
        <div className="trk-action">
          {status === "none" || status === "forming" ? (ready ? (
            me?.confirmed
              ? <p className="small">You&apos;re ready. Waiting for {st.campaigns.filter((x) => !x.confirmed).map((x) => x.name).join(", ")} to confirm.</p>
              : <>
                  <p className="small">Your {st.pool && n > 1 ? `coalition of ${n} campaigns covers` : "area covers"} about <b>{fmt(kids)}</b> kids, enough to go to Treasury. When you&apos;re happy with who&apos;s in, confirm. Once every campaign has, we draw up the coalition agreement for everyone to sign.</p>
                  <ConfirmCoalitionButton slug={c.slug} />
                </>
          ) : <p className="small">An area needs {fmt(minKids)} kids. You have about {fmt(kids)}: pool with a match below, or start a new campaign with more ZIP codes.</p>) : null}
          {status === "confirmed" && <Link className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} href={href}>{st.me.signed ? `View the agreement (${signedN} of ${people} signed)` : "Review and sign, or leave"}</Link>}
          {(status === "approved" || status === "rejected") && (<>
            <p className="small">Everyone signed. Hometown Seed&apos;s nonprofit has filled in Treasury&apos;s contribution application for {money(st.pool!.raised)}. Check it and send it.</p>
            <Link className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} href={href + "#treasury"}>{status === "rejected" ? "Revise and resend the application" : "Review and send the application"}</Link>
          </>)}
          {status === "submitted" && <Link className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} href={href + "#treasury"}>View the application status</Link>}
          {status === "accepted" && <Link className="btn btn-green btn-sm" style={{ alignSelf: "flex-start" }} href={href + "#treasury"}>Record the payment to Treasury</Link>}
          {(status === "funded" || status === "distributed") && <Link className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} href={href + "#treasury"}>View payment and messages</Link>}
        </div>
      )}
    </section>
  );
}

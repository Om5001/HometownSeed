import Link from "next/link";
import type { Metadata } from "next";
import { ORG_PUBLIC, PLATFORM, shown } from "@/lib/platform";
import { getRules } from "@/lib/queries";
import { fmt } from "@/lib/format";

export const metadata: Metadata = {
  title: "About · Hometown Seed",
  description: "Hometown Seed Foundation is a 501(c)(3) nonprofit that helps neighbors give, together, to the Trump Accounts of every child in the places they care about.",
};
export const dynamic = "force-dynamic";

export default async function About() {
  const rules = await getRules();
  const min = fmt(rules.min_beneficiaries);
  return (
    <main className="about">
      <section className="wrap about-hero">
        <p className="eyebrow">About Hometown Seed</p>
        <h1>Neighbors seeding every child&apos;s future, <em>one ZIP code at a time.</em></h1>
        <p className="lede">
          {PLATFORM.entity_name} is a 501(c)(3) nonprofit. We help people who care about a place, the town they grew up in,
          the neighborhood where they raise their kids, come together and give to the Trump Accounts of <b>every child there</b>,
          in equal shares.
        </p>
        <div className="about-ctas">
          <Link className="btn btn-green" href="/start">Start a campaign</Link>
          <Link className="btn btn-ghost" href="/donate">Donate to the Fund</Link>
          <Link className="btn btn-ghost" href="/">Explore the map</Link>
        </div>
      </section>

      <section className="wrap about-grid">
        <div className="panel about-card">
          <h2>Why we exist</h2>
          <p>Every American child can now have a Trump Account: an investment account that grows until they turn 18. The federal government seeds $1,000 for children born from 2025 through 2028, and families, employers and the community can add more.</p>
          <p>The law also lets a charity give to <b>every child in a place at once</b>, as long as the area has at least {min} children. That&apos;s powerful, and out of reach for most people on their own. A neighbor who wants to give $25 to each kid in their hometown can&apos;t file with Treasury, find {min} children, or split a gift evenly.</p>
          <p><b>We do that part.</b> You pick the places and the amount; we find the people giving to the same kids, put the coalition together, and handle the paperwork and the money.</p>
        </div>
        <div className="panel about-card">
          <h2>What we believe</h2>
          <ul className="about-list">
            <li><b>Every child counts the same.</b> Each eligible child in an area receives an equal share. Treasury&apos;s rules require it, and we think it&apos;s right.</li>
            <li><b>Place, not paperwork.</b> Gifts are defined by where children live and their age, never by income, race or need tests on individual families.</li>
            <li><b>Neighbors decide.</b> Everyone in a coalition, organizers and donors, signs the agreement or can leave. Nothing goes to Treasury without them.</li>
            <li><b>Open books.</b> Every agreement, signature and application has a fingerprint, and every dollar has a record from pledge to child&apos;s account.</li>
            <li><b>Your gift is extra.</b> Community gifts don&apos;t use up the $5,000 a family can add to a child&apos;s account each year.</li>
          </ul>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head"><h2>How it works</h2></div>
        <div className="steps about-steps">
          <div className="step"><span className="n">1</span><h3>Pick places and a goal</h3><p>Choose ZIP codes and an amount, in total or per child. We show how many children live there, from Census data.</p></div>
          <div className="step"><span className="n">2</span><h3>Team up</h3><p>We match you with people and campaigns funding the same kids or at a similar amount per child, until the area reaches {min} children.</p></div>
          <div className="step"><span className="n">3</span><h3>Everyone signs</h3><p>We draw up a coalition agreement naming everyone involved, the places, the kids and the money. Each person signs or leaves.</p></div>
          <div className="step"><span className="n">4</span><h3>We send it to Treasury</h3><p>As the 501(c)(3) Qualified Donor, we apply to Treasury, send one contribution by ACH or wire, and Treasury splits it evenly into every eligible child&apos;s account.</p></div>
        </div>
      </section>

      <section className="wrap about-grid">
        <div className="panel about-card">
          <h2>Our role as a 501(c)(3)</h2>
          <p>Only charities and governments can make these contributions, so a nonprofit has to stand in the middle. For each coalition, {PLATFORM.entity_name}:</p>
          <ul className="about-list">
            <li>receives the coalition&apos;s gifts and issues receipts;</li>
            <li>applies to Treasury as the <b>Qualified Donor</b>, with the coalition&apos;s agreement attached;</li>
            <li>sends one contribution once Treasury approves, and reports back to everyone;</li>
            <li>if Treasury declines, holds the funds while the coalition decides, together, where they go.</li>
          </ul>
          <p className="small muted">A coalition can also choose a member&apos;s own 501(c)(3), like a local community foundation, as its Qualified Donor. <Link href="/nonprofits">Find a nonprofit</Link></p>
        </div>
        <div className="panel about-card">
          <h2>The organization</h2>
          <dl className="about-facts">
            <dt>Legal name</dt><dd>{PLATFORM.entity_name}</dd>
            <dt>Status</dt><dd>501(c)(3) public charity</dd>
            <dt>EIN</dt><dd>{shown(PLATFORM.ein)}</dd>
            <dt>Mailing address</dt><dd>{shown(PLATFORM.entity_address)}</dd>
            <dt>Contact</dt><dd>{shown(ORG_PUBLIC.contact_email, "Use Messages while signed in")}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 12 }}>Hometown Seed is independent. It isn&apos;t part of, or endorsed by, the U.S. Treasury, the IRS or any account provider. &ldquo;Trump Accounts&rdquo; is the name of the federal program.</p>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head"><h2>Questions</h2></div>
        <div className="about-faq">
          <details><summary>Is my gift tax-deductible?</summary><p>Gifts to a 501(c)(3) are generally deductible for people who itemize, and you&apos;ll get a receipt. Check with a tax advisor about your situation. While this site is in its prototype stage, gifts are recorded as pledges only and no money is charged.</p></details>
          <details><summary>Does my money go to one particular child?</summary><p>No. A coalition&apos;s contribution is split evenly across every eligible child in its ZIP codes and age group, as Treasury counts them on its record date.</p></details>
          <details><summary>Why does an area need {min} children?</summary><p>The law sets that minimum for gifts defined by a geographic area. Smaller towns can still qualify by pooling neighboring ZIP codes, which is what our matching is for.</p></details>
          <details><summary>Can I give stock or use a donor-advised fund?</summary><p>Yes. Choose them on your giving profile. Stock given to children&apos;s accounts must be shares of publicly traded U.S. companies, and they stay in the account for 5 years, or until the childStock given to children&apos;s accounts must be publicly traded U.S. company shares, held until the child turns 18 or for 5 years.apos;s 18th year if that comes first.</p></details>
          <details><summary>What if Treasury says no?</summary><p>The funds stay with the nonprofit, and the coalition agrees, through a new agreement everyone signs, what to do next: revise and resend, or direct the money elsewhere.</p></details>
          <details><summary>Can I just donate, without running a campaign?</summary><p>Yes. <Link href="/donate">Give to the Hometown Seed Fund</Link>, once or monthly, and choose where it goes: wherever it&apos;s needed most, a state, or a ZIP code. The Fund adds to coalitions there when they go to Treasury.</p></details>
          <details><summary>How is this different from the big pledges on the map?</summary><p>Those are gifts announced by individual philanthropists and companies, shown for context. Hometown Seed is for everyone else: neighbors pooling smaller gifts so they add up to every child in a place.</p></details>
        </div>
      </section>

      <section className="wrap section about-close">
        <h2>Start with the place you care about.</h2>
        <div className="about-ctas"><Link className="btn btn-green" href="/start">Start a campaign</Link><Link className="btn btn-ghost" href="/donate">Donate</Link><Link className="btn btn-ghost" href="/match">Find partners</Link></div>
      </section>
    </main>
  );
}

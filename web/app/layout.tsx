import type { Metadata } from "next";
import Link from "next/link";
import "./legacy.css";
import "./app.css";
import { getUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { VerifyBanner } from "@/components/VerifyBanner";

export const metadata: Metadata = {
  title: "Hometown Seed",
  description: "Pool gifts with neighbors to seed every child's Trump Account in the ZIP codes you care about.",
};

const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect width="30" height="30" rx="9" fill="var(--green)" />
    <path d="M15 23v-8.5" stroke="var(--on-green)" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M15 15c0-4 2.6-6.6 7-6.6 0 4.2-2.7 6.6-7 6.6Z" fill="var(--on-green)" />
    <path d="M15 17.2c0-3.2-2.1-5.3-5.6-5.3 0 3.4 2.2 5.3 5.6 5.3Z" fill="var(--on-green)" />
  </svg>
);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try { user = await getUser(); } catch { /* DB not configured yet */ }
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <Link className="brand" href="/" style={{ textDecoration: "none", color: "inherit" }}><Logo />Hometown Seed</Link>
            <nav className="nav">
              {user ? (
                <>
                  <Link className="navlink keep" href="/match">Match</Link>
                  <Link className="navlink" href="/connections">Matches</Link>
                  <Link className="navlink" href="/me">My campaigns</Link>
                  <Link className="navlink" href="/account">Profile</Link>
                  <SignOutButton />
                  <Link className="btn btn-green btn-sm" href="/start"><span className="long">Start a campaign</span><span className="short">Start</span></Link>
                </>
              ) : (
                <>
                  <Link className="navlink" href="/#campaigns">Campaigns</Link>
                  <Link className="navlink" href="/#how">How it works</Link>
                  <Link className="navlink keep" href="/signin">Sign in</Link>
                  <Link className="btn btn-green btn-sm" href="/signin?mode=signup&next=/start"><span className="long">Start a campaign</span><span className="short">Start</span></Link>
                </>
              )}
            </nav>
          </div>
        </header>
        {user && !user.email_verified && <VerifyBanner email={user.email} />}
        {children}
        <footer>
          <div className="wrap">
            <p><b style={{ color: "var(--ink)" }}>Hometown Seed is a prototype.</b> It is not affiliated with the U.S. Treasury, the IRS, or any account provider. Gifts are recorded as pledges only; no payments are processed.</p>
            <p>Child counts: U.S. Census Bureau, American Community Survey 5-year estimates (tables B09001, B05003, B19013) by ZIP Code Tabulation Area. Estimated account beneficiaries = children under 18, adjusted by each area&apos;s share of U.S. citizens. Treasury determines the actual children in a contribution on its record date.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

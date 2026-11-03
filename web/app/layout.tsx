import type { Metadata } from "next";
import Link from "next/link";
import "./legacy.css";
import "./app.css";
import { getUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { VerifyBanner } from "@/components/VerifyBanner";
import { BusyCursor } from "@/components/BusyCursor";
import { UnreadBadge } from "@/components/Messaging";
import { NavMenu } from "@/components/NavMenu";
import { unreadTotal } from "@/lib/messages";
import { Suspense } from "react";

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
  let unread = 0;
  try { user = await getUser(); if (user) unread = await unreadTotal(user.id); } catch { /* DB not configured yet */ }
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" />
      </head>
      <body>
        <Suspense fallback={null}><BusyCursor /></Suspense>
        <header className="top">
          <div className="wrap">
            <Link className="brand" href="/" style={{ textDecoration: "none", color: "inherit" }}><Logo />Hometown Seed</Link>
            <nav className="nav">
              {user ? (
                <>
                  <Link className="navlink wide-only" href="/match">Find partners</Link>
                  <Link className="navlink keep navmsg" href="/messages" aria-label="Messages"><span className="msg-word">Messages</span><span className="msg-icon" aria-hidden="true">✉</span><UnreadBadge initial={unread} /></Link>
                  <Link className="navlink wide-only" href="/me">My campaigns</Link>
                  <Link className="navlink wide-only" href="/nonprofits">Nonprofits</Link>
                  <Link className="navlink wide-only" href="/account">Profile</Link>
                  <span className="wide-only"><SignOutButton /></span>
                  <NavMenu signOut links={[{ href: "/match", label: "Find partners" }, { href: "/messages", label: "Messages" }, { href: "/me", label: "My campaigns" },
                    { href: "/connections", label: "Saved and invites" }, { href: "/nonprofits", label: "Nonprofits" }, { href: "/account", label: "Profile" }]} />
                  <Link className="btn btn-green btn-sm" href="/start"><span className="long">Start a campaign</span><span className="short">Start</span></Link>
                </>
              ) : (
                <>
                  <Link className="navlink wide-only" href="/#campaigns">Campaigns</Link>
                  <Link className="navlink wide-only" href="/#how">How it works</Link>
                  <Link className="navlink wide-only" href="/nonprofits">Nonprofits</Link>
                  <Link className="navlink keep" href="/signin">Sign in</Link>
                  <NavMenu links={[{ href: "/#campaigns", label: "Campaigns" }, { href: "/#how", label: "How it works" }, { href: "/nonprofits", label: "Nonprofits" }]} />
                  <Link className="btn btn-green btn-sm" href="/signin?mode=signup&next=/start"><span className="long">Start a campaign</span><span className="short">Start</span></Link>
                </>
              )}
            </nav>
          </div>
        </header>
        {user?.is_demo && <div className="demo-banner"><div className="wrap"><b>Demo account.</b> Shared sample data for trying things out; it will be removed. <SignOutButton /></div></div>}
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

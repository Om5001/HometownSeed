"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menu button for narrow screens: holds the links that don't fit in the header. Closes after you pick one. */
export function NavMenu({ links, signOut }: { links: { href: string; label: string }[]; signOut?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => { ref.current?.removeAttribute("open"); }, [path]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open"); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <details className="navmenu" ref={ref}>
      <summary aria-label="Menu"><span aria-hidden="true">☰</span><span className="navmenu-label">Menu</span></summary>
      <div className="navmenu-list" role="menu">
        {links.map((l) => <Link key={l.href} role="menuitem" href={l.href}>{l.label}</Link>)}
        {signOut && <button role="menuitem" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; }}>Sign out</button>}
      </div>
    </details>
  );
}

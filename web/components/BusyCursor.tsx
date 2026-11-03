"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Shows a "working" cursor and a thin progress bar at the top of the page while the
 * site is waiting: during page changes and while any request to the server is open.
 */
export function BusyCursor() {
  const pathname = usePathname();
  const search = useSearchParams();

  // A page change finished: stop the navigation indicator.
  useEffect(() => { document.documentElement.classList.remove("hs-nav"); }, [pathname, search]);

  useEffect(() => {
    const root = document.documentElement;
    let open = 0, navTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => root.classList.toggle("hs-busy", open > 0);

    // Every fetch from the page (forms, buttons, search) counts while it's open.
    const w = window as unknown as { __hsFetch?: typeof fetch };
    if (!w.__hsFetch) {
      w.__hsFetch = window.fetch;
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        open++; sync();
        try { return await w.__hsFetch!(...args); } finally { open = Math.max(0, open - 1); sync(); }
      };
    }

    // Clicking a link to another page on this site.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;  // same page (#anchor)
      root.classList.add("hs-nav");
      clearTimeout(navTimer); navTimer = setTimeout(() => root.classList.remove("hs-nav"), 15000);
    };
    const onBack = () => { root.classList.add("hs-nav"); clearTimeout(navTimer); navTimer = setTimeout(() => root.classList.remove("hs-nav"), 15000); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onBack);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onBack); };
  }, []);
  return null;
}

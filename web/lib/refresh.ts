"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Server render stamp written by the root layout (see app/layout.tsx). */
const stamp = () => document.getElementById("hs-render")?.getAttribute("data-t") ?? "";

/**
 * Reload the server data on the current page after a change (pledge, sign, send...).
 * Next.js occasionally drops a soft refresh, leaving the old state on screen. We check
 * that a fresh server render actually arrived (the layout's render stamp changed); if not,
 * we try again, and as a last resort reload the page.
 */
export function useRefresh() {
  const router = useRouter();
  return useCallback((reloadIfStuck = true) => {
    const before = stamp();
    router.refresh();
    setTimeout(() => {
      if (stamp() !== before) return;
      router.refresh();
      if (reloadIfStuck) setTimeout(() => { if (stamp() === before) window.location.reload(); }, 1500);
    }, 1200);
  }, [router]);
}

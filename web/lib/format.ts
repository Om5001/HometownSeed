export const fmt = (n: number | null | undefined) => Math.round(Number(n || 0)).toLocaleString("en-US");

export const usd = (dollars: number, digits = 0) =>
  "$" + dollars.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Cents -> "$1,234" (or with cents when small). */
export const money = (cents: number | bigint | null | undefined, digits?: number) => {
  const d = Number(cents || 0) / 100;
  return usd(d, digits ?? (d > 0 && d < 100 && d % 1 !== 0 ? 2 : 0));
};

/** Compact: $12K, $1.2M */
export const moneyC = (cents: number | bigint | null | undefined) => {
  const n = Number(cents || 0) / 100;
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0+$/, "") + "M";
  if (n >= 1e4) return "$" + Math.round(n / 1e3) + "K";
  return usd(n);
};

/** Per-child cents, which can be fractions of a cent in big areas. */
export const perChild = (cents: number | null | undefined) => {
  const v = Number(cents || 0) / 100;
  if (v >= 0.01) return usd(v, 2);
  if (v > 0) return (v * 100).toFixed(v * 100 >= 0.1 ? 2 : 3) + "¢";
  return "$0";
};

export const ago = (iso: string | Date) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " hr ago";
  const d = Math.floor(s / 86400);
  return d === 1 ? "Yesterday" : d + " days ago";
};

export const initials = (n: string) =>
  n === "Anonymous" ? "♥" : n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export const ageLabel = (min: number, max: number) =>
  min === 0 && max === 17 ? "All kids under 18" : `Kids ages ${min}–${max}`;

export const placeLabel = (p: { place_name?: string | null; place_state?: string | null; zcta: string }) =>
  p.place_name ? `${p.place_name}${p.place_state ? ", " + p.place_state : ""}` : `ZIP ${p.zcta}`;

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "campaign";

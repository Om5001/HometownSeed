/** Check mark for people who represent a 501(c)(3). */
export function NonprofitBadge({ name, verified = true, compact = false }: { name?: string | null; verified?: boolean; compact?: boolean }) {
  const label = compact ? "501(c)(3)" : name ? `501(c)(3): ${name}` : "Represents a 501(c)(3)";
  return <span className={"np-badge" + (verified ? "" : " self")} title={verified ? "Verified with IRS or ProPublica records" : "Self-reported, not yet verified"}>✓ {label}</span>;
}

/**
 * Hometown Seed's own nonprofit: the 501(c)(3) that receives every coalition's gifts
 * and applies to Treasury as the Qualified Donor.
 *
 * FILL IN LATER: replace the bracketed placeholders below (or set the ORG_* variables in
 * web/.env.local, which take priority). While any field is still a placeholder, the
 * application is marked as a draft, and real (non-mock) submission is blocked.
 */
const env = (k: string, fallback: string) => (process.env[k] || "").trim() || fallback;

export const PLATFORM = {
  entity_name:    env("ORG_LEGAL_NAME", "Hometown Seed Foundation, Inc."),
  entity_address: env("ORG_ADDRESS", "[Mailing address]"),
  ein:            env("ORG_EIN", "[EIN 00-0000000]"),
  entity_type:    "501c3" as const,
  rep_name:       env("ORG_REP_NAME", "[Authorized representative]"),
  rep_title:      env("ORG_REP_TITLE", "Executive Director"),
  rep_address:    env("ORG_REP_ADDRESS", env("ORG_ADDRESS", "[Mailing address]")),
  rep_email:      env("ORG_REP_EMAIL", "applications@hometownseed.org"),
  rep_phone:      env("ORG_REP_PHONE", "[Phone]"),
};
export type Platform = typeof PLATFORM;

/** Fields that still hold a [placeholder]. */
export function platformPlaceholders(): string[] {
  return Object.entries(PLATFORM).filter(([, v]) => /\[.*\]/.test(String(v))).map(([k]) => k.replace(/_/g, " "));
}

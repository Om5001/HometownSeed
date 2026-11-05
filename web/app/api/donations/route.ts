import { handle, ok, readJson, requireUser } from "@/lib/http";
import { audit } from "@/lib/queries";
import { createDonation, fundSummary } from "@/lib/donations";

/** The Hometown Seed Fund at a glance. */
export const GET = handle(async () => ok(await fundSummary()));

/** Give to the Hometown Seed Fund (a pledge until payments are connected). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser({ verified: true });
  const d = await createDonation(user, await readJson(req));
  await audit(user.id, "fund.donate", "fund_donation", d.id, d);
  return ok({ ...d, payment: { kind: "pledge_only", note: "Prototype: this is a pledge. No money was charged." } }, { status: 201 });
});

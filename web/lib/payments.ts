/**
 * Payments seam. The prototype records pledges only.
 * Production: implement with the charity partner's processor (e.g. Stripe Checkout on the
 * charity's own Stripe account, or a DAF/giving platform API). Return a redirect URL here,
 * then confirm the payment in a webhook route that sets pledges.status = 'succeeded'
 * and writes a ledger_entries 'donation' row. Never collect card numbers in this app.
 */
export type PaymentStart =
  | { kind: "pledge_only"; note: string }
  | { kind: "redirect"; url: string };

export async function startPayment(_p: { pledgeId: string; amountCents: number; campaignSlug: string; email: string | null }): Promise<PaymentStart> {
  return { kind: "pledge_only", note: "Prototype: this is a pledge. No money was charged." };
}

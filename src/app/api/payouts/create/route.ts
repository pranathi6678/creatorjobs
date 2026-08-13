import { NextRequest, NextResponse } from "next/server";
import { createPayoutRecord, getOrder, getSeller, transitionOrder } from "@/lib/db";
import { createPayout, listPayoutMethods } from "@/lib/whop";

// Initiates a real payout from platform balance to the seller's connected
// account, guarded by the order state machine (only "fulfilled" orders can
// move to "payout_initiated"). Whop doesn't document a payout.* webhook event
// in the current docs (only payment.*, membership.*, ledger_account.funds_available
// are listed) — noted as a blocker in README — so payout completion here is
// tracked via the payouts table's own status rather than a webhook callback.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orderId } = body as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const order = await getOrder(orderId);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const seller = await getSeller(order.seller_id);
  if (!seller?.whop_company_id) {
    return NextResponse.json({ error: "seller has no connected Whop account" }, { status: 400 });
  }
  if (seller.kyc_status !== "verified") {
    return NextResponse.json({ error: "seller has not completed KYC" }, { status: 400 });
  }

  const transition = await transitionOrder(orderId, "payout_initiated");
  if (!transition.ok) return NextResponse.json({ error: transition.reason }, { status: 409 });

  if (!process.env.WHOP_API_KEY) {
    const record = await createPayoutRecord({
      orderId,
      sellerId: seller.id,
      amountCents: order.amount_cents,
      currency: order.currency,
      status: "pending",
      error: "WHOP_API_KEY not configured — payout recorded locally only",
    });
    return NextResponse.json({ payout: record, order: transition.order });
  }

  try {
    const methods = await listPayoutMethods(seller.whop_company_id);
    const defaultMethod = methods.data.find((m) => m.is_default) ?? methods.data[0];
    if (!defaultMethod) throw new Error("seller has no payout method on file");

    const payout = await createPayout({
      accountId: seller.whop_company_id,
      amountCents: order.amount_cents,
      currency: order.currency,
      payoutMethodId: defaultMethod.id,
    });

    const record = await createPayoutRecord({
      orderId,
      sellerId: seller.id,
      amountCents: order.amount_cents,
      currency: order.currency,
      whopPayoutId: payout.id,
      status: "paid",
    });
    const completed = await transitionOrder(orderId, "payout_completed");
    return NextResponse.json({ payout: record, order: completed.ok ? completed.order : transition.order });
  } catch (err) {
    const record = await createPayoutRecord({
      orderId,
      sellerId: seller.id,
      amountCents: order.amount_cents,
      currency: order.currency,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ payout: record, error: "payout_failed" }, { status: 502 });
  }
}

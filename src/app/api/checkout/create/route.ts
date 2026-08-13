import { NextRequest, NextResponse } from "next/server";
import { createOrder, getListing } from "@/lib/db";
import { createCheckoutConfiguration } from "@/lib/whop";

// Creates the order row (state=pending_payment) before the buyer ever pays.
// This is deliberate: we want an order to exist the moment checkout starts so
// a payment.succeeded webhook always has something to match against via the
// metadata.order_id we attach to the checkout configuration below.
//
// The listing must already have a whop_plan_id (created in the Whop dashboard —
// see README "API blockers" for why plan creation itself isn't done via API here).
// Given that plan_id, POST /checkout_configurations returns a real, working
// purchase_url with our order id embedded in metadata and our redirect_url set,
// so Whop carries order_id through onto the resulting payment automatically.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { listingId, buyerEmail, buyerName } = body as {
    listingId?: string;
    buyerEmail?: string;
    buyerName?: string;
  };

  if (!listingId || !buyerEmail) {
    return NextResponse.json({ error: "listingId and buyerEmail are required" }, { status: 400 });
  }

  const listing = await getListing(listingId);
  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "listing not found or not active" }, { status: 404 });
  }

  const order = await createOrder({
    listingId: listing.id,
    sellerId: listing.seller_id,
    buyerEmail,
    buyerName: buyerName ?? "",
    amountCents: listing.price_cents,
    currency: listing.currency,
    whopCheckoutPlanId: listing.whop_plan_id ?? undefined,
  });

  if (!listing.whop_plan_id || !process.env.WHOP_API_KEY) {
    return NextResponse.json({ order, purchaseUrl: null });
  }

  try {
    const config = await createCheckoutConfiguration({
      planId: listing.whop_plan_id,
      orderId: order.id,
      redirectUrl: `${req.nextUrl.origin}/orders/${order.id}`,
    });
    const purchaseUrl = config.purchase_url.startsWith("http")
      ? config.purchase_url
      : `https://whop.com${config.purchase_url}`;
    return NextResponse.json({ order, purchaseUrl });
  } catch (err) {
    return NextResponse.json(
      { order, purchaseUrl: null, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

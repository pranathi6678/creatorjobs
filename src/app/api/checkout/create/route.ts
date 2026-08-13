import { NextRequest, NextResponse } from "next/server";
import { createOrder, getListing } from "@/lib/db";

// Creates the order row (state=pending_payment) before the buyer ever pays.
// This is deliberate: we want an order to exist the moment checkout starts so
// a payment.succeeded webhook always has something to match against via the
// metadata.order_id we attach to the Whop payment/checkout.
//
// Blocker noted (see README "API blockers"): docs.whop.com does not document a
// server-side "create checkout session" experimental endpoint that returns a
// hosted URL — the documented pattern is a dashboard-created Plan ID rendered
// through the client-side <WhopCheckoutEmbed planId=... /> component. We follow
// that documented pattern: this route only reserves the order + returns the
// plan id for the client to render the embed against.
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

  return NextResponse.json({ order, whopPlanId: listing.whop_plan_id });
}

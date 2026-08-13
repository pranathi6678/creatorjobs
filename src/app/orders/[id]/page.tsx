import { getListing, getOrder, getSeller } from "@/lib/db";
import { notFound } from "next/navigation";

const STATE_COPY: Record<string, { label: string; help: string; color: string }> = {
  pending_payment: {
    label: "Awaiting payment",
    help: "We haven't received payment confirmation yet.",
    color: "bg-neutral-100 text-neutral-700",
  },
  paid: {
    label: "Paid",
    help: "Payment confirmed. The seller has been notified to start work.",
    color: "bg-green-100 text-green-800",
  },
  payment_failed: {
    label: "Payment failed",
    help: "The payment didn't go through — you can try checking out again.",
    color: "bg-red-100 text-red-800",
  },
  fulfilled: {
    label: "Fulfilled",
    help: "The seller marked this order as delivered.",
    color: "bg-blue-100 text-blue-800",
  },
  payout_initiated: {
    label: "Payout in progress",
    help: "We're paying the seller out now.",
    color: "bg-blue-100 text-blue-800",
  },
  payout_completed: {
    label: "Complete",
    help: "Order fulfilled and seller paid out.",
    color: "bg-green-100 text-green-800",
  },
  refunded: {
    label: "Refunded",
    help: "This order was refunded.",
    color: "bg-neutral-100 text-neutral-700",
  },
};

export default async function OrderStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const [listing, seller] = await Promise.all([getListing(order.listing_id), getSeller(order.seller_id)]);
  const copy = STATE_COPY[order.state];

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">Order status</h1>
      <p className="mt-1 text-sm text-neutral-500">Order #{order.id.slice(0, 8)}</p>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${copy.color}`}>
          {copy.label}
        </span>
        <p className="mt-3 text-sm text-neutral-600">{copy.help}</p>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Listing</dt>
            <dd>{listing?.title}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Seller</dt>
            <dd>{seller?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Amount</dt>
            <dd>
              ${(order.amount_cents / 100).toFixed(2)} {order.currency.toUpperCase()}
            </dd>
          </div>
          {order.whop_payment_id && (
            <div className="flex justify-between">
              <dt className="text-neutral-500">Whop payment ID</dt>
              <dd className="font-mono text-xs">{order.whop_payment_id}</dd>
            </div>
          )}
        </dl>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        This page doesn&apos;t poll live — refresh to see updates after a webhook lands.
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type OrderRow = {
  id: string;
  state: string;
  amount_cents: number;
  currency: string;
  buyer_email: string;
  whop_payment_id: string | null;
  created_at: string;
  listings: { title: string } | null;
  sellers: { name: string; kyc_status: string; payout_method_added: boolean } | null;
};

type WebhookEventRow = {
  id: string;
  whop_webhook_id: string;
  event_type: string;
  status: string;
  error: string | null;
  received_at: string;
  order_id: string | null;
};

const STATE_COLOR: Record<string, string> = {
  pending_payment: "bg-neutral-100 text-neutral-700",
  paid: "bg-green-100 text-green-800",
  payment_failed: "bg-red-100 text-red-800",
  fulfilled: "bg-blue-100 text-blue-800",
  payout_initiated: "bg-indigo-100 text-indigo-800",
  payout_completed: "bg-green-100 text-green-800",
  refunded: "bg-neutral-100 text-neutral-700",
};

export default function DashboardClient({
  orders,
  webhookEvents,
}: {
  orders: OrderRow[];
  webhookEvents: WebhookEventRow[];
}) {
  const router = useRouter();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  async function fulfill(orderId: string) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/fulfill`, { method: "POST" });
      if (!res.ok) alert((await res.json()).error);
      router.refresh();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function initiatePayout(orderId: string) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch("/api/payouts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) alert((await res.json()).error);
      router.refresh();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function simulate(orderId: string, eventType: string) {
    setBusyOrderId(orderId);
    try {
      await fetch("/api/webhooks/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, eventType }),
      });
      router.refresh();
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="mb-3 font-medium">Orders</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Listing</th>
                <th className="px-4 py-2">Buyer</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Seller payout status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-mono text-xs">{o.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{o.listings?.title}</td>
                  <td className="px-4 py-2">{o.buyer_email}</td>
                  <td className="px-4 py-2">${(o.amount_cents / 100).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_COLOR[o.state]}`}>
                      {o.state}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {o.sellers?.kyc_status !== "verified"
                      ? "seller not KYC-verified"
                      : !o.sellers?.payout_method_added
                        ? "no payout method"
                        : "ready"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {o.state === "pending_payment" && (
                        <button
                          disabled={busyOrderId === o.id}
                          onClick={() => simulate(o.id, "payment.succeeded")}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs"
                        >
                          Simulate paid
                        </button>
                      )}
                      {o.state === "paid" && (
                        <button
                          disabled={busyOrderId === o.id}
                          onClick={() => fulfill(o.id)}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs"
                        >
                          Mark fulfilled
                        </button>
                      )}
                      {o.state === "fulfilled" && (
                        <button
                          disabled={busyOrderId === o.id}
                          onClick={() => initiatePayout(o.id)}
                          className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                        >
                          Initiate payout
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Webhook delivery log</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Received</th>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Webhook ID</th>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {webhookEvents.map((ev) => (
                <tr key={ev.id}>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {new Date(ev.received_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{ev.event_type}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {ev.whop_webhook_id.startsWith("sim_") ? (
                      <span className="text-amber-600">{ev.whop_webhook_id} (simulated)</span>
                    ) : (
                      ev.whop_webhook_id
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{ev.order_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        ev.status === "error"
                          ? "bg-red-100 text-red-800"
                          : ev.status === "processed"
                            ? "bg-green-100 text-green-800"
                            : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {ev.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-red-600">{ev.error ?? ""}</td>
                </tr>
              ))}
              {webhookEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    No webhook deliveries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

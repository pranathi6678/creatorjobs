"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Two payment paths, both landing on /orders/[id] where the real, authoritative
// order status comes from the payment.succeeded webhook — never from the
// client redirect itself (a buyer closing the tab shouldn't be trusted as
// "payment happened").
//
// 1. Real checkout: if the listing has a Whop Plan ID (created in the Whop
//    dashboard — see README "API blockers" for why we don't create plans via
//    the API), /api/checkout/create calls POST /checkout_configurations
//    server-side and returns a real purchase_url with our order id already
//    embedded in metadata — Whop carries that through onto the resulting
//    payment automatically.
// 2. Test payment: no Plan ID configured (e.g. this demo environment has no
//    live Whop credentials yet) — a clearly-labeled simulate button exercises
//    the exact same webhook-processing code path via /api/webhooks/simulate.
export default function CheckoutForm({
  listingId,
  whopPlanId,
}: {
  listingId: string;
  whopPlanId: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<"real" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createOrder() {
    const res = await fetch("/api/checkout/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, buyerEmail: email, buyerName: name }),
    });
    const data = await res.json();
    if (!res.ok && !data.order) throw new Error(data.error ?? "Could not start checkout");
    return data as { order: { id: string }; purchaseUrl: string | null; error?: string };
  }

  async function payWithWhop(e: React.FormEvent) {
    e.preventDefault();
    setLoading("real");
    setError(null);
    try {
      const { purchaseUrl, error: checkoutError } = await createOrder();
      if (!purchaseUrl) throw new Error(checkoutError ?? "Could not create Whop checkout");
      window.location.href = purchaseUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(null);
    }
  }

  async function simulatePayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading("test");
    setError(null);
    try {
      const { order } = await createOrder();
      await fetch("/api/webhooks/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, eventType: "payment.succeeded" }),
      });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div>
        <label className="block text-sm font-medium">Your name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {whopPlanId ? (
        <button
          onClick={payWithWhop}
          disabled={!email || !name || loading !== null}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading === "real" ? "Redirecting to Whop checkout..." : "Pay with Whop"}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This listing has no Whop Plan ID configured, so real checkout is disabled. Use the
            test button below to simulate a successful payment — it runs through the same
            order-state and webhook-processing code as a real payment, minus the actual charge.
          </p>
          <button
            onClick={simulatePayment}
            disabled={!email || !name || loading !== null}
            className="w-full rounded-md border border-neutral-900 px-4 py-2 disabled:opacity-50"
          >
            {loading === "test" ? "Simulating payment..." : "Simulate test payment"}
          </button>
        </div>
      )}
    </div>
  );
}

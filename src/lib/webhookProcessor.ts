import { OrderState } from "./orderState";

type TransitionFn = (
  orderId: string,
  to: OrderState,
  patch?: Record<string, unknown>
) => Promise<{ ok: true; order: unknown } | { ok: false; reason: string }>;

// Shared by the real webhook route and the dashboard's "simulate event" tool,
// so a simulated event exercises exactly the same logic a real one would.
export async function processWhopEvent(
  event: { type: string; data: Record<string, unknown> },
  transitionOrder: TransitionFn
): Promise<{ applied: boolean; orderId?: string; reason?: string }> {
  const orderId = (event.data?.metadata as Record<string, unknown> | undefined)?.order_id as
    | string
    | undefined;

  switch (event.type) {
    case "payment.succeeded": {
      if (!orderId) return { applied: false, reason: "no order_id in metadata" };
      const res = await transitionOrder(orderId, "paid", {
        whop_payment_id: event.data.id as string,
      });
      return res.ok
        ? { applied: true, orderId }
        : { applied: false, orderId, reason: res.reason };
    }
    case "payment.failed": {
      if (!orderId) return { applied: false, reason: "no order_id in metadata" };
      const res = await transitionOrder(orderId, "payment_failed", {
        whop_payment_id: event.data.id as string,
      });
      return res.ok
        ? { applied: true, orderId }
        : { applied: false, orderId, reason: res.reason };
    }
    case "payment.pending":
    case "payment.created":
      // No-op: order already starts in pending_payment. Logged for visibility
      // (dashboard webhook log) but doesn't drive a state transition.
      return { applied: false, orderId, reason: "informational_only" };
    default:
      return { applied: false, reason: `unhandled_event_type_${event.type}` };
  }
}

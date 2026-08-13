export type OrderState =
  | "pending_payment"
  | "paid"
  | "payment_failed"
  | "fulfilled"
  | "payout_initiated"
  | "payout_completed"
  | "refunded";

// Explicit allow-list of forward transitions. Anything not listed here is
// rejected so an out-of-order or duplicate webhook can never regress state
// (e.g. a late-arriving `payment.pending` after we already recorded `paid`).
const ALLOWED_TRANSITIONS: Record<OrderState, OrderState[]> = {
  pending_payment: ["paid", "payment_failed"],
  paid: ["fulfilled", "refunded"],
  payment_failed: ["pending_payment"], // buyer retries checkout
  fulfilled: ["payout_initiated"],
  payout_initiated: ["payout_completed"],
  payout_completed: [],
  refunded: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  if (from === to) return false; // no-op transitions are treated as already-applied, not errors
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

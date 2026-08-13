import { supabaseAdmin } from "./supabase";
import { OrderState, canTransition } from "./orderState";

export type Seller = {
  id: string;
  name: string;
  email: string;
  whop_company_id: string | null;
  kyc_status: "not_started" | "pending" | "verified" | "rejected";
  payout_method_added: boolean;
  created_at: string;
};

export type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  whop_plan_id: string | null;
  status: "active" | "paused" | "archived";
};

export type Order = {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_email: string;
  buyer_name: string;
  amount_cents: number;
  currency: string;
  state: OrderState;
  whop_payment_id: string | null;
  whop_checkout_plan_id: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getSeller(id: string): Promise<Seller | null> {
  const { data, error } = await supabaseAdmin().from("sellers").select("*").eq("id", id).single();
  if (error) return null;
  return data as Seller;
}

export async function createSeller(input: { name: string; email: string }) {
  const { data, error } = await supabaseAdmin()
    .from("sellers")
    .insert({ name: input.name, email: input.email })
    .select()
    .single();
  if (error) throw error;
  return data as Seller;
}

export async function updateSeller(id: string, patch: Partial<Seller>) {
  const { data, error } = await supabaseAdmin()
    .from("sellers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Seller;
}

export async function listActiveListings(): Promise<(Listing & { seller_name: string })[]> {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("*, sellers(name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, seller_name: (row as { sellers?: { name?: string } }).sellers?.name ?? "Unknown" }));
}

export async function getListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabaseAdmin().from("listings").select("*").eq("id", id).single();
  if (error) return null;
  return data as Listing;
}

export async function listListingsForSeller(sellerId: string): Promise<Listing[]> {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Listing[];
}

export async function createListing(input: {
  sellerId: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  whopPlanId?: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .insert({
      seller_id: input.sellerId,
      title: input.title,
      description: input.description,
      price_cents: input.priceCents,
      currency: input.currency,
      whop_plan_id: input.whopPlanId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Listing;
}

export async function createOrder(input: {
  listingId: string;
  sellerId: string;
  buyerEmail: string;
  buyerName: string;
  amountCents: number;
  currency: string;
  whopCheckoutPlanId?: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .insert({
      listing_id: input.listingId,
      seller_id: input.sellerId,
      buyer_email: input.buyerEmail,
      buyer_name: input.buyerName,
      amount_cents: input.amountCents,
      currency: input.currency,
      whop_checkout_plan_id: input.whopCheckoutPlanId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabaseAdmin().from("orders").select("*").eq("id", id).single();
  if (error) return null;
  return data as Order;
}

export async function listOrdersForDashboard() {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("*, listings(title), sellers(name, kyc_status, payout_method_added)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

// The only place order.state is ever written. Rejects any transition not in the
// explicit allow-list so a duplicate/out-of-order webhook can't corrupt state.
export async function transitionOrder(
  orderId: string,
  to: OrderState,
  patch: Partial<Order> = {}
): Promise<{ ok: true; order: Order } | { ok: false; reason: string }> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.state === to) return { ok: true, order }; // already applied, idempotent no-op
  if (!canTransition(order.state, to)) {
    return { ok: false, reason: `illegal_transition_${order.state}_to_${to}` };
  }
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({ state: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", orderId)
    .select()
    .single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, order: data as Order };
}

// Webhook idempotency: insert-or-detect-duplicate keyed on Whop's webhook-id header.
export async function recordWebhookEvent(input: {
  whopWebhookId: string;
  eventType: string;
  payload: unknown;
}): Promise<{ isDuplicate: boolean; id: string }> {
  const { data, error } = await supabaseAdmin()
    .from("webhook_events")
    .insert({
      whop_webhook_id: input.whopWebhookId,
      event_type: input.eventType,
      payload: input.payload,
    })
    .select()
    .single();

  if (error) {
    // Unique violation on whop_webhook_id means we've already seen this delivery
    // (or a retry of it) — treat as a duplicate rather than an error.
    if (error.code === "23505") {
      const existing = await supabaseAdmin()
        .from("webhook_events")
        .select("id")
        .eq("whop_webhook_id", input.whopWebhookId)
        .single();
      return { isDuplicate: true, id: existing.data?.id ?? "" };
    }
    throw error;
  }
  return { isDuplicate: false, id: data.id };
}

export async function markWebhookEvent(
  id: string,
  status: "processed" | "ignored" | "error",
  patch: { orderId?: string; error?: string } = {}
) {
  await supabaseAdmin()
    .from("webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      order_id: patch.orderId,
      error: patch.error,
    })
    .eq("id", id);
}

export async function listWebhookEvents(limit = 100) {
  const { data, error } = await supabaseAdmin()
    .from("webhook_events")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createPayoutRecord(input: {
  orderId: string;
  sellerId: string;
  amountCents: number;
  currency: string;
  whopPayoutId?: string;
  status: "pending" | "paid" | "failed";
  error?: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from("payouts")
    .insert({
      order_id: input.orderId,
      seller_id: input.sellerId,
      amount_cents: input.amountCents,
      currency: input.currency,
      whop_payout_id: input.whopPayoutId,
      status: input.status,
      error: input.error,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

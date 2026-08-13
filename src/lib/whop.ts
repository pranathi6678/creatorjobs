import crypto from "node:crypto";

// Thin, transparent fetch wrapper over the Whop REST API rather than the
// @whop/sdk package. Kept as raw HTTP calls on purpose: this is a debugging
// tool for a CSM, and every request/response shape here is exactly what's
// on the wire, which is what you want when triaging a customer's integration.
//
// Base URL + Api-Version-Date pin per https://docs.whop.com/developer/api/versioning
// We default to the sandbox host until WHOP_ENV=production is set explicitly.
const WHOP_API_VERSION_DATE = "2026-07-01";

function baseUrl() {
  return process.env.WHOP_ENV === "production"
    ? "https://api.whop.com/api/v1"
    : "https://sandbox-api.whop.com/api/v1";
}

function apiKey() {
  const key = process.env.WHOP_API_KEY;
  if (!key) throw new Error("Missing WHOP_API_KEY");
  return key;
}

async function whopFetch<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: Record<string, unknown> } = {}
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "Api-Version-Date": WHOP_API_VERSION_DATE,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new WhopApiError(res.status, json);
  }
  return json as T;
}

export class WhopApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Whop API error ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

// --- Connected accounts (sellers) -------------------------------------------------
// POST /companies with parent_company_id creates a sub-company ("connected account")
// under our platform company. Docs: api-reference/companies/create-company
export async function createConnectedAccount(params: {
  title: string;
  email: string;
  metadata?: Record<string, unknown>;
}) {
  return whopFetch<{ id: string; title: string }>("/companies", {
    method: "POST",
    body: {
      title: params.title,
      email: params.email,
      parent_company_id: process.env.WHOP_PLATFORM_COMPANY_ID,
      metadata: params.metadata,
    },
  });
}

// POST /account_links. use_case="account_onboarding" for KYC, "payouts_portal"
// for the self-serve withdrawal UI. Docs: api-reference/account-links/create-account-link
export async function createAccountLink(params: {
  companyId: string;
  useCase: "account_onboarding" | "payouts_portal";
  returnUrl: string;
  refreshUrl: string;
}) {
  return whopFetch<{ url: string; expires_at: string }>("/account_links", {
    method: "POST",
    body: {
      company_id: params.companyId,
      use_case: params.useCase,
      return_url: params.returnUrl,
      refresh_url: params.refreshUrl,
    },
  });
}

// --- Checkout -----------------------------------------------------------------------
// POST /checkout_configurations against an existing dashboard-created plan_id.
// Returns a real purchase_url with our order id embedded in metadata, which Whop
// carries through onto the resulting payment/membership — so the payment.succeeded
// webhook can match it back to our order via event.data.metadata.order_id.
// Docs: api-reference/checkout-configurations/create-checkout-configuration
export async function createCheckoutConfiguration(params: {
  planId: string;
  orderId: string;
  redirectUrl: string;
}) {
  return whopFetch<{ id: string; purchase_url: string }>("/checkout_configurations", {
    method: "POST",
    body: {
      plan_id: params.planId,
      mode: "payment",
      metadata: { order_id: params.orderId },
      redirect_url: params.redirectUrl,
    },
  });
}

// --- Payouts ------------------------------------------------------------------------
// POST /payouts, moves funds from platform balance to a connected account's payout
// method. Docs: developer/platforms/manual-payouts
export async function createPayout(params: {
  accountId: string;
  amountCents: number;
  currency: string;
  payoutMethodId: string;
  platformCoversFees?: boolean;
}) {
  return whopFetch<{ id: string; status: string }>("/payouts", {
    method: "POST",
    body: {
      account_id: params.accountId,
      amount: (params.amountCents / 100).toFixed(2),
      currency: params.currency,
      payout_method_id: params.payoutMethodId,
      platform_covers_fees: params.platformCoversFees ?? false,
    },
  });
}

export async function listPayoutMethods(accountId: string) {
  return whopFetch<{ data: Array<{ id: string; is_default: boolean }> }>(
    `/payout_methods?account_id=${accountId}`
  );
}

// --- Webhook signature verification --------------------------------------------------
// Whop implements the Standard Webhooks spec: sign `{id}.{timestamp}.{raw body}`
// with HMAC-SHA256 using the webhook secret, base64-encode, compare in constant time.
// Docs: developer/guides/webhooks
export function verifyWebhookSignature(params: {
  rawBody: string;
  webhookId: string;
  timestamp: string;
  signatureHeader: string; // "v1,<base64>" (may contain multiple space-separated sigs)
}): boolean {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing WHOP_WEBHOOK_SECRET");

  // Reject stale timestamps to block replay attacks (5 minute window per docs).
  const tsSeconds = Number(params.timestamp);
  if (!Number.isFinite(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return false;
  }

  const signedContent = `${params.webhookId}.${params.timestamp}.${params.rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedContent)
    .digest("base64");

  const candidates = params.signatureHeader
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter(Boolean) as string[];

  return candidates.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

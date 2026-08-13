# CreatorJobs — Whop Technical CSM Take-Home

A minimal two-sided marketplace (buyers hire sellers for work) with Whop powering
seller onboarding, buyer checkout, payment confirmation, order state, seller
payout setup, and an ops dashboard tying it all together.

**Live app:** https://creatorjobs-pearl.vercel.app
**Repo:** https://github.com/pranathi6678/creatorjobs
**Video walkthrough:** _(Loom link goes here — see LOOM_SCRIPT.md for the talking track)_

There's a live demo dataset on the deployed dashboard (`/dashboard`) from
end-to-end smoke testing — a seller, listing, and an order taken through
`paid -> fulfilled` via the test-payment simulator described below.

## What I used

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind, Supabase (Postgres)
  for storage, deployed on Vercel.
- **Whop integration:** direct REST calls to `api.whop.com/api/v1` (no SDK
  dependency — see "Why raw REST instead of `@whop/sdk`" below), built from
  `docs.whop.com`.
- **AI assistance:** this prototype — architecture, all code, the Supabase
  schema/migration, the Whop API research, local end-to-end testing, and this
  writeup — was built with Claude (Anthropic's coding agent) as the primary
  author, working directly against `docs.whop.com`, Google, and public npm/GitHub
  sources. Per the take-home instructions, that's disclosed here rather than
  left implicit.

## Architecture

```
Buyer                          Seller
  |                               |
  |  browse listing               |  onboard -> Whop connected account (company)
  |  checkout                     |  -> hosted KYC (account_link, account_onboarding)
  v                               v
Order (pending_payment) <---- Listing ----> Seller (kyc_status, payout_method_added)
  |
  | webhook: payment.succeeded / payment.failed
  v
Order (paid / payment_failed)
  |
  | ops marks fulfilled
  v
Order (fulfilled)
  |
  | ops initiates payout -> Whop payout to seller's connected account
  v
Order (payout_initiated -> payout_completed)
```

**Tables** (`supabase/migrations/0001_init.sql`): `sellers`, `listings`,
`orders`, `payouts`, `webhook_events`.

**Order state machine** (`src/lib/orderState.ts`): an explicit allow-list of
forward transitions —

```
pending_payment -> paid -> fulfilled -> payout_initiated -> payout_completed
pending_payment -> payment_failed -> pending_payment (buyer retries)
paid -> refunded
```

Every write to `orders.state` goes through `transitionOrder()` in
`src/lib/db.ts`, which rejects anything not on that list. This is what stops a
duplicate or out-of-order webhook from corrupting state — e.g. a late
`payment.pending` arriving after we've already recorded `paid` is simply
rejected, not applied.

## Reliability & security

- **Webhook signature verification** (`src/lib/whop.ts: verifyWebhookSignature`):
  implements Whop's Standard Webhooks scheme — HMAC-SHA256 over
  `{webhook-id}.{webhook-timestamp}.{raw body}`, base64, constant-time compare,
  and a 5-minute timestamp freshness window to block replay. Verified end-to-end
  locally: a correctly-signed event is accepted and applied, a tampered body
  with the same signature is rejected with 401, and a byte-for-byte retry
  (same `webhook-id`) is detected as a duplicate and not reprocessed.
- **Idempotency**: `webhook_events.whop_webhook_id` is `unique`. Every inbound
  delivery is inserted there first; a unique-violation means "already seen,"
  and processing short-circuits before touching order state.
- **Event log**: every webhook (real or simulated) is logged with its raw
  payload, processing status (`received` / `processed` / `ignored` / `error`),
  and any error — visible on `/dashboard`.
- **Safe state transitions**: see order state machine above.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
supabase link --project-ref <your-ref>
supabase db push
npm run dev
```

Env vars:

| Var | Where it comes from |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API |
| `WHOP_ENV` | `sandbox` or `production` |
| `WHOP_API_KEY` | whop.com/dashboard → Developer → API Keys |
| `WHOP_PLATFORM_COMPANY_ID` | your platform's own Whop company id (`biz_xxx`) |
| `WHOP_WEBHOOK_SECRET` | created when you register a webhook endpoint pointing at `/api/webhooks/whop` |

**Without `WHOP_API_KEY` configured**, the app still runs fully — seller/listing/
order creation all work against Supabase, and a "Simulate test payment" button
on each listing exercises the exact same webhook-processing and state-machine
code a real `payment.succeeded` webhook would (see `/api/webhooks/simulate`,
which calls the same `processWhopEvent()` the real webhook route uses). This is
how the app is demoable without live Whop credentials, and it's also a useful
debugging tool in its own right — it mirrors Whop's own
`POST /webhooks/{id}/test`.

## API blockers / where I deviated from "Experimental only"

The take-home asked to prefer Experimental endpoints and note it when Stable
had to be used instead. Three specific gaps I hit in `docs.whop.com`:

1. **No documented way to opt into the Experimental API.** The beta overview
   page (`api-reference/beta/overview`) references beta paths like
   `/api-reference/beta/accounts/account` but never documents a header, URL
   prefix, or dashboard toggle to actually request beta behavior. The only
   documented versioning knob is the `Api-Version-Date` header (pin a dated
   shape, e.g. `2026-07-01`), which is what `src/lib/whop.ts` sends on every
   request — that's the Stable mechanism, used because the Experimental
   opt-in mechanism isn't documented anywhere I could find.
2. **No documented server-side "create checkout session" endpoint.** Payments
   (`POST /payments`) require a `confirmation_token` that's produced
   client-side by completing Whop's checkout widget against a **Plan ID
   created in the Whop dashboard** — there's no documented API to create that
   plan/checkout session programmatically. So `CheckoutForm.tsx` follows the
   documented pattern (redirect to Whop's hosted checkout for a
   dashboard-created `plan_id`) rather than trying to synthesize a checkout
   session from scratch. This is also why the webhook, not the client-side
   redirect, is treated as the source of truth for "did payment happen" —
   the client-side completion callback is never trusted on its own.
3. **No `payout.*` webhook event.** The documented webhook event list covers
   `payment.*`, `membership.*`, and `ledger_account.funds_available`, but
   nothing that fires on payout completion/failure. Payout status here is
   therefore tracked in our own `payouts` table (set from the `POST /payouts`
   response) rather than via webhook callback — in production I'd add a
   polling reconciliation job against `GET /payouts/{id}` to catch anything
   that changes state after the initial response.

## Why raw REST instead of `@whop/sdk`

`@whop/sdk` exists and is real, but I intentionally didn't add it as a
dependency. This app is a debugging tool for a CSM as much as it's a
marketplace — every Whop call in `src/lib/whop.ts` is a plain `fetch()` with
an explicit path, headers, and body, so when something breaks, what's on the
wire is exactly what's in the code, with no SDK method-name-to-endpoint
translation layer to second-guess while triaging a customer issue.

## What's intentionally out of scope

- **Auth**: there's no session/login system. A seller's "session" is just
  their row UUID in the URL (`/sell/[id]`) — fine for a prototype, not for
  production. Production would use Whop OAuth or the connected account's own
  session.
- **Refund flows, disputes, multi-currency**: schema has room (`orders.state`
  includes `refunded`) but no UI/API path exercises them yet.
- **Payout reconciliation job**: noted above as a blocker workaround.

## Written scenario answers

See [SCENARIOS.md](./SCENARIOS.md).

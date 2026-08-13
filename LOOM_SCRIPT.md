# Loom walkthrough — talking track (~4 min)

Record screen + voice. Tabs to have open before hitting record: the deployed
app (https://creatorjobs-pearl.vercel.app), the GitHub repo, and this repo's
README/SCENARIOS.md.

---

**[0:00–0:20] Frame it]**
"This is CreatorJobs, a minimal marketplace prototype for the Whop Technical
CSM take-home. Two user types — buyers who pay for work, sellers who do it —
and Whop powers onboarding, checkout, payment confirmation, order state, and
payouts. I'll walk through the flow, then show the ops dashboard, then the
reliability pieces the rubric asks about specifically."

**[0:20–1:00] Seller onboarding**
- Go to `/sell`, create a seller.
- "This creates a Whop connected account under our platform company and sends
  them through hosted KYC — `account_links.create` with `use_case:
  account_onboarding`. In this recording I don't have live Whop credentials
  yet, so it's created locally and I'll point out where the real call goes in
  the code — `src/app/api/seller/route.ts`."
- Show the seller dashboard at `/sell/[id]`, point at the KYC status pill and
  the "refresh verification status" button — explain that's a manual re-sync
  against Whop's `GET /companies/{id}` since there's no documented
  KYC-completed webhook.

**[1:00–1:40] Listing + buyer checkout**
- Create a listing.
- Go to the public listing page. Explain the two checkout paths: real Whop
  hosted checkout if a Plan ID is set (dashboard-created — explain the
  blocker: no documented API to create checkout sessions), or the "simulate
  test payment" button otherwise, which runs through the exact same
  webhook-processing code as a real webhook.
- Click simulate, land on the order status page.

**[1:40–2:30] The ops dashboard**
- Go to `/dashboard`.
- Point at the orders table: payment/order state, seller payout readiness.
- Point at the webhook delivery log: every event, real or simulated, logged
  with status and error. Point out the "(simulated)" tag distinguishing test
  events from real Whop deliveries.
- Click "Mark fulfilled" → "Initiate payout" on an order, showing the state
  machine advance live.

**[2:30–3:20] Reliability/security — the part that doesn't show up in the UI**
- Open `src/lib/whop.ts: verifyWebhookSignature` — walk through Standard
  Webhooks signature verification, the 5-minute replay window.
- Open `src/lib/db.ts: recordWebhookEvent` — the unique constraint on
  `whop_webhook_id` that makes retries idempotent.
- Open `src/lib/orderState.ts` — the explicit transition allow-list.
- "I tested all three of these directly against the deployed webhook
  endpoint before recording this — a correctly signed event applies, a
  retried delivery is detected as duplicate and skipped, and a tampered body
  with a stale signature gets rejected with 401. That's in the README."

**[3:20–3:50] Blockers**
- Briefly name the three API blockers from the README: no documented
  Experimental opt-in mechanism, no documented checkout-session-creation
  endpoint, no payout completion webhook — and how each was worked around.

**[3:50–4:00] Close**
- "Written scenario answers are in SCENARIOS.md, code's on GitHub, app's live
  at the Vercel link. Thanks."

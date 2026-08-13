# Written scenarios

Answered as the Technical CSM handling CreatorJobs post-launch, using the
system built in this repo (order state machine, `webhook_events` log, ops
dashboard) as the actual toolset referenced below.

---

## Scenario 1 — Buyer paid, order still pending

> A buyer paid for a listing, but our marketplace still says the order is
> pending. Is Whop broken?

**Issue type:** Webhook delivery/integration gap (far more likely than a Whop
outage — payments succeeding while state doesn't update is almost always a
webhook not arriving, not being verified, or not matching an order).

**Customer reply:**

```
Thanks for flagging — this almost never means Whop itself is down; it usually
means the payment-succeeded event isn't making it from Whop into your app's
order state. Can you send me the order ID and roughly when the buyer paid?
I'll check our webhook log and Whop's delivery log for that window and get
back to you within the hour with the specific cause.
```

**Internal action:**
1. Look up the order in `/dashboard` — check `webhook_events` for a
   `payment.succeeded` row with `order_id` matching this order, and its
   `status` (`processed` vs `error` vs missing entirely).
2. If missing entirely: check the Whop dashboard's webhook delivery log
   (`GET /webhooks/{id}/deliveries`) for that time window — was it delivered
   and did our endpoint respond non-2xx (crash, wrong secret → 401, timeout)?
3. If delivered and logged but `status = error`: read the stored `error` —
   most likely `no order_id in metadata`, meaning the checkout wasn't created
   with `metadata.order_id` attached, or the buyer paid via a stale checkout
   link from before the order existed.
4. If delivered, verified, and processed, but state still shows pending in
   the UI: check for a caching issue in the customer's own frontend rather
   than our side.

**Urgency:** High. The buyer already paid — every minute this looks "broken"
erodes trust in both the marketplace and Whop, even though it's usually a
one-line fix.

**Evidence to collect:** order ID, buyer email or Whop payment ID if known,
screenshot of the "pending" state, our `webhook_events` row (or its absence)
for that order, Whop's webhook delivery log entry (status code, response
body, timestamp, retry count).

**Escalate to engineering:** No, in the common case — this is CSM-resolvable
(re-point the webhook URL, regenerate a mismatched secret, ask the customer
to check their endpoint's uptime/logs). Escalate only if the delivery log
shows Whop successfully delivered the event, our endpoint returned 200, and
the event is logged as `processed` — yet the order state genuinely didn't
change. That would point to a bug in our own state-machine code, not a
config/integration issue.

---

## Scenario 2 — Seller cannot receive payouts

> The seller completed onboarding, but they still can't withdraw. This is
> blocking launch.

**Issue type:** Payout prerequisite gap. Withdrawal requires three things in
order: KYC verified, a payout method on file, and (implicitly) a positive
withdrawable balance — "completed onboarding" often means only step one.

**Customer reply:**

```
Withdrawing needs three things to all be true: identity verification
complete, a payout method added, and available balance. "Completed
onboarding" usually covers the first one — let me check the seller's account
directly and tell you exactly which of the three is missing rather than
guessing. Can you confirm the seller's email or their account ID on your
side?
```

**Internal action:**
1. Pull the seller's row: `kyc_status` and `payout_method_added` as we last
   synced them.
2. Re-sync live against Whop (`GET /companies/{id}`, `verified` field) via the
   "Refresh verification status" button on `/sell/[id]` — our cached status
   can be stale if the seller finished KYC after our last check.
3. Call `GET /payout_methods?account_id=...` — confirm a method exists and
   one is `is_default: true`.
4. Check the ledger/balance for that connected account — a verified seller
   with a payout method but zero withdrawable balance will also appear
   "stuck," and that's a different (correct, not-a-bug) explanation.

**Urgency:** High — explicitly blocking launch, and it's seller-facing trust
(sellers who can't get paid will churn immediately).

**Evidence to collect:** seller's Whop connected account ID (`biz_xxx`), our
`kyc_status` vs. live `verified` value from Whop, the `payout_methods` list
response, any error message shown to the seller in the payout portal, and
timestamps of when onboarding/KYC was completed.

**Escalate to engineering:** Only if the live Whop data shows
`verified: true`, a default payout method exists, and balance is positive,
and withdrawal is still failing — that pattern looks like a genuine
platform-side bug and needs a real repro handed to engineering with the
account ID and exact error. Otherwise this is resolvable by walking the
seller back through whichever step (KYC or payout method) is actually
incomplete.

---

## Scenario 3 — 401 on connected account API key

> We created a connected seller, but all api calls return 401 errors.

**Issue type:** Auth/config issue — the most common cause by far is that the
customer is trying to authenticate *as* the connected account with a
per-seller key that doesn't exist; connected accounts are accessed using the
**platform's own API key**, addressing the sub-account via `company_id` in
the request, not a separate credential per seller.

**Customer reply:**

```
Quick question before I dig in: are you authenticating with your platform's
own API key and passing the connected account's ID as company_id in the
request, or are you trying to use a separate key for the seller's account?
401s on every call, right after creating a connected account, is almost
always the latter. If it's the former, send me one full example request
(redact the actual key value) and I'll check key status and scopes on our
side.
```

**Internal action:**
1. Confirm which key the customer is sending — key id (not value), whether
   it's the platform key or something else.
2. Check the key hasn't been revoked or rotated, and has the required
   permissions (`company:create`, `company:basic:read`, etc.).
3. Confirm sandbox vs. production base URL isn't mismatched with the key's
   environment (`sandbox-api.whop.com` vs `api.whop.com`) — a sandbox key
   against the production host, or vice versa, presents as a blanket 401.
4. Check the `Api-Version-Date` header isn't malformed in a way that's
   rejected before auth even runs.

**Urgency:** High — total API blockage, nothing else can be tested until
this is resolved.

**Evidence to collect:** one full example request with the key redacted,
the exact response body/headers, the API key ID in use, confirmation of
sandbox vs. production intent, and a timestamp (to cross-reference against
any key rotation events on our side).

**Escalate to engineering:** Not initially — 9 times out of 10 this is a
customer-side auth pattern or environment mismatch, resolvable with the
checklist above. Escalate with a minimal repro only if the key is confirmed
active, correctly scoped, hitting the right host, and still returns 401 —
that specific combination points to a genuine auth-service bug.

---

## Scenario 4 — Dashboard request

> We need one dashboard showing buyer payment, order state, seller payout
> status, webhook delivery, and errors. Without this, our ops team is blind.

**Issue type:** Feature/observability gap, not a bug — and one this
prototype already answers directly.

**Customer reply:**

```
Good news — this is exactly what we built into the prototype's ops dashboard
(/dashboard): one table per order showing payment state, order state, and
seller payout readiness, plus a webhook delivery log with status and errors
for every event received. I'd like to walk your ops team through it live
and get their feedback on what's missing before we call it done — a few
things I'd want their input on are date-range filtering, CSV export, and
whether they want per-order drill-down into the raw webhook payload.
```

**Internal action:** Since the dashboard already exists in this build,
the internal action is confirming it covers their actual ops workflow (not
just what we assumed), then scoping the gaps they flag — likely candidates:
role-based access for their ops team, alerting on `webhook_events.status =
'error'` rather than requiring someone to check the page, and the payout
reconciliation job noted in the README's blockers section (polling
`GET /payouts/{id}` since Whop doesn't emit a payout completion webhook).

**Urgency:** Medium — important for launch confidence and ops trust, but not
an active incident. Schedule a walkthrough this week rather than treating it
as a fire.

**Evidence to collect:** N/A for diagnosis — this is a requirements
conversation. Worth confirming with the customer which specific fields their
ops team currently can't find, since "blind" might mean something more
specific than the general ask suggests.

**Escalate to engineering:** No for the dashboard itself — it's built.
Escalate only if the customer wants this natively embedded inside Whop's own
merchant dashboard (a Whop product feature request, not something the
platform team owns) rather than in the customer's own app.

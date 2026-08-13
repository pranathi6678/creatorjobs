-- CreatorJobs marketplace schema
-- Buyers = businesses paying for work. Sellers = creators/freelancers doing the work.
-- All Whop calls happen server-side with the service role key; no RLS policies are
-- needed for anon/browser access because the browser never talks to Supabase directly.

create extension if not exists "pgcrypto";

-- One row per seller onboarding onto the platform's Whop company via a connected account.
create table sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  whop_company_id text unique,        -- biz_xxx, the connected account (sub-company)
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'verified', 'rejected')),
  payout_method_added boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  title text not null,
  description text not null default '',
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'usd',
  whop_plan_id text,                  -- plan_xxx used for checkout, if pre-created in dashboard
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);

-- The order state machine. Only forward transitions are allowed (see lib/orderState.ts):
-- pending_payment -> paid -> fulfilled -> payout_initiated -> payout_completed
--                  -> payment_failed (terminal)
-- paid -> refunded (terminal, branch off "paid")
create table orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  seller_id uuid not null references sellers(id),
  buyer_email text not null,
  buyer_name text not null default '',
  amount_cents integer not null,
  currency text not null default 'usd',
  state text not null default 'pending_payment' check (state in (
    'pending_payment', 'paid', 'payment_failed', 'fulfilled',
    'payout_initiated', 'payout_completed', 'refunded'
  )),
  whop_payment_id text,               -- pay_xxx, set once payment.succeeded/failed arrives
  whop_checkout_plan_id text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_seller_id_idx on orders(seller_id);
create index orders_state_idx on orders(state);
create index orders_whop_payment_id_idx on orders(whop_payment_id);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  seller_id uuid not null references sellers(id),
  whop_payout_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

-- Every inbound webhook is logged here first, keyed on Whop's `webhook-id` header so
-- retries (same webhook-id) are naturally deduped via the unique constraint.
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  whop_webhook_id text not null unique,   -- the `webhook-id` header, dedupe key
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'error')),
  error text,
  order_id uuid references orders(id)
);

create index webhook_events_status_idx on webhook_events(status);
create index webhook_events_order_id_idx on webhook_events(order_id);

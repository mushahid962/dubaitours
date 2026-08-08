-- =====================================================================
-- 0004_commerce.sql
-- Carts/holds, bookings, payments, refunds, coupons, wallet, payouts.
-- Money is stored as numeric(12,2) in a stated currency, never as float.
-- =====================================================================

create table coupons (
  id               uuid primary key default gen_random_uuid(),
  code             citext not null unique,
  company_id       uuid references companies(id) on delete cascade,  -- null = platform-wide
  discount_type    discount_type not null default 'percentage',
  discount_value   numeric(12,2) not null check (discount_value > 0),
  max_discount     numeric(12,2),
  min_order_total  numeric(12,2) not null default 0,
  currency         currency_code,
  applies_to_tours uuid[] not null default '{}',
  applies_to_cities uuid[] not null default '{}',
  applies_to_categories uuid[] not null default '{}',
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  usage_limit      integer,
  usage_limit_per_user smallint not null default 1,
  used_count       integer not null default 0,
  first_order_only boolean not null default false,
  is_active        boolean not null default true,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index coupons_active_idx on coupons (is_active, ends_at);

create table bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,                 -- THG-8F3K2QD, shown to travelers
  profile_id       uuid references profiles(id) on delete set null,   -- null for guest checkout
  company_id       uuid not null references companies(id) on delete restrict,
  status           booking_status not null default 'pending',

  guest_email      citext not null,
  guest_name       text not null,
  guest_phone      text not null,
  guest_locale     locale_code not null default 'en',
  guest_country_id uuid references countries(id) on delete set null,

  currency         currency_code not null,
  subtotal         numeric(12,2) not null default 0,
  discount_total   numeric(12,2) not null default 0,
  fees_total       numeric(12,2) not null default 0,
  tax_total        numeric(12,2) not null default 0,
  grand_total      numeric(12,2) not null default 0,
  wallet_applied   numeric(12,2) not null default 0,
  amount_due       numeric(12,2) not null default 0,
  commission_total numeric(12,2) not null default 0,      -- platform revenue
  supplier_net     numeric(12,2) not null default 0,

  coupon_id        uuid references coupons(id) on delete set null,
  coupon_code      citext,

  hold_expires_at  timestamptz,                            -- seats released after this
  confirmed_at     timestamptz,
  cancelled_at     timestamptz,
  cancellation_reason text,
  completed_at     timestamptz,

  source           text not null default 'web' check (source in ('web','ios','android','api','affiliate','admin')),
  utm              jsonb not null default '{}'::jsonb,
  affiliate_ref    text,
  ip_country       char(2),
  idempotency_key  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bookings_totals_non_negative check (grand_total >= 0 and amount_due >= 0)
);
create unique index bookings_idempotency_uq on bookings (idempotency_key) where idempotency_key is not null;
create index bookings_profile_idx on bookings (profile_id, created_at desc);
create index bookings_company_idx on bookings (company_id, created_at desc);
create index bookings_status_idx on bookings (status) where status in ('pending','awaiting_payment','on_hold');
create index bookings_hold_expiry_idx on bookings (hold_expires_at) where hold_expires_at is not null;

create table booking_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references bookings(id) on delete cascade,
  tour_id        uuid not null references tours(id) on delete restrict,
  option_id      uuid not null references tour_options(id) on delete restrict,
  departure_id   uuid not null references tour_departures(id) on delete restrict,
  starts_at      timestamptz not null,
  seats          integer not null check (seats > 0),
  pax_breakdown  jsonb not null,        -- {"adult": 2, "child": 1}
  unit_prices    jsonb not null,        -- {"adult": 250.00, "child": 150.00}
  line_subtotal  numeric(12,2) not null,
  line_discount  numeric(12,2) not null default 0,
  line_total     numeric(12,2) not null,
  commission_rate numeric(5,2) not null,
  pickup_point_id uuid references tour_pickup_points(id) on delete set null,
  pickup_note    text,
  supplier_ref   text,
  ticket_code    text,                  -- QR payload, issued on confirmation
  redeemed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index booking_items_booking_idx on booking_items (booking_id);
create index booking_items_departure_idx on booking_items (departure_id);
create index booking_items_tour_idx on booking_items (tour_id, starts_at);

create table booking_travelers (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references booking_items(id) on delete cascade,
  pax          pax_type not null,
  full_name    text,
  age          smallint,
  passport_no  text,       -- encrypted at the app layer when required by the supplier
  nationality  char(2),
  notes        text
);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  provider          payment_provider not null,
  status            payment_status not null default 'initiated',
  currency          currency_code not null,
  amount            numeric(12,2) not null check (amount >= 0),
  amount_captured   numeric(12,2) not null default 0,
  amount_refunded   numeric(12,2) not null default 0,
  provider_intent_id text,
  provider_charge_id text,
  provider_fee      numeric(12,2),
  card_brand        text,
  card_last4        char(4),
  failure_code      text,
  failure_message   text,
  raw_event         jsonb not null default '{}'::jsonb,
  authorized_at     timestamptz,
  captured_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index payments_intent_uq on payments (provider, provider_intent_id) where provider_intent_id is not null;
create index payments_booking_idx on payments (booking_id);

-- Every webhook we accept is recorded once; replay attacks become no-ops.
create table payment_events (
  id           uuid primary key default gen_random_uuid(),
  provider     payment_provider not null,
  event_id     text not null,
  event_type   text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  error        text,
  received_at  timestamptz not null default now(),
  unique (provider, event_id)
);

create table refunds (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  payment_id    uuid references payments(id) on delete set null,
  amount        numeric(12,2) not null check (amount > 0),
  currency      currency_code not null,
  reason        text not null,
  policy_applied cancellation_policy,
  penalty_amount numeric(12,2) not null default 0,
  status        payment_status not null default 'initiated',
  provider_refund_id text,
  requested_by  uuid references profiles(id) on delete set null,
  approved_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create table coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references coupons(id) on delete cascade,
  booking_id  uuid not null references bookings(id) on delete cascade,
  profile_id  uuid references profiles(id) on delete set null,
  amount      numeric(12,2) not null,
  created_at  timestamptz not null default now(),
  unique (coupon_id, booking_id)
);
create index coupon_redemptions_profile_idx on coupon_redemptions (coupon_id, profile_id);

create table gift_cards (
  id             uuid primary key default gen_random_uuid(),
  code_hash      text not null unique,        -- store a hash, never the raw code
  last4          char(4) not null,
  currency       currency_code not null,
  initial_amount numeric(12,2) not null check (initial_amount > 0),
  balance        numeric(12,2) not null check (balance >= 0),
  purchased_by   uuid references profiles(id) on delete set null,
  recipient_email citext,
  message        text,
  expires_at     timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table wallets (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  currency    currency_code not null default 'AED',
  balance     numeric(12,2) not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

create table wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  type        wallet_txn_type not null,
  amount      numeric(12,2) not null,          -- signed: credits positive, debits negative
  currency    currency_code not null,
  balance_after numeric(12,2) not null,
  booking_id  uuid references bookings(id) on delete set null,
  gift_card_id uuid references gift_cards(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index wallet_txn_profile_idx on wallet_transactions (profile_id, created_at desc);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  number        text not null unique,          -- INV-2026-000123, gapless per year
  issued_to     jsonb not null,                -- name, address, TRN
  currency      currency_code not null,
  subtotal      numeric(12,2) not null,
  tax_total     numeric(12,2) not null,
  total         numeric(12,2) not null,
  tax_lines     jsonb not null default '[]'::jsonb,  -- [{label:"VAT 5%", rate:5, amount:...}]
  pdf_url       text,
  issued_at     timestamptz not null default now()
);

create table payouts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete restrict,
  period_start  date not null,
  period_end    date not null,
  currency      currency_code not null,
  gross_amount  numeric(12,2) not null,
  commission    numeric(12,2) not null,
  adjustments   numeric(12,2) not null default 0,
  net_amount    numeric(12,2) not null,
  status        payout_status not null default 'scheduled',
  provider_transfer_id text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (company_id, period_start, period_end)
);

create table payout_items (
  payout_id  uuid not null references payouts(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete restrict,
  amount     numeric(12,2) not null,
  primary key (payout_id, booking_id)
);

create trigger touch_bookings before update on bookings for each row execute function internal.touch_updated_at();
create trigger touch_payments before update on payments for each row execute function internal.touch_updated_at();
create trigger touch_wallets  before update on wallets  for each row execute function internal.touch_updated_at();

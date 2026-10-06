-- In-app card payments with Stripe Connect.
--
-- Sellers connect a Stripe Express account once; buyers pay by card through
-- Stripe Checkout; Stripe sends the money to the seller minus the platform
-- fee. The server writes payment rows with the service role (webhook), never
-- the browser.

-- Sales can now also happen in the app.
alter table public.transactions drop constraint transactions_channel_check;
alter table public.transactions
  add constraint transactions_channel_check check (channel in ('meetup', 'sunday_market', 'in_app'));

-- ---------------------------------------------------------------------------
-- Seller payout accounts (one Stripe connected account per student)
-- ---------------------------------------------------------------------------
create table public.payout_accounts (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id  text not null unique,
  country            text not null check (country ~ '^[A-Z]{2}$'),
  ready              boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;
grant select on public.payout_accounts to authenticated;

create policy "students see own payout account" on public.payout_accounts
  for select to authenticated using (user_id = auth.uid());

-- Buyers only need a yes/no: can this seller be paid by card?
create function public.seller_accepts_cards(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.ready from public.payout_accounts a where a.user_id = p_seller_id), false);
$$;

revoke execute on function public.seller_accepts_cards(uuid) from public, anon;
grant execute on function public.seller_accepts_cards(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Orders (card payments)
-- ---------------------------------------------------------------------------
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  listing_id                uuid not null references public.listings (id) on delete cascade,
  buyer_id                  uuid references public.profiles (id) on delete set null,
  seller_id                 uuid not null references public.profiles (id) on delete cascade,
  amount_cents              integer not null check (amount_cents > 0),
  fee_cents                 integer not null check (fee_cents >= 0),
  currency                  text not null,
  stripe_session_id         text not null unique,
  stripe_payment_intent_id  text,
  -- refund_needed: paid after someone else already bought it; the webhook refunds it.
  status                    text not null check (status in ('paid', 'refund_needed', 'refunded')),
  created_at                timestamptz not null default now()
);

create index orders_listing_idx on public.orders (listing_id);

alter table public.orders enable row level security;
grant select on public.orders to authenticated;

create policy "parties see their orders" on public.orders
  for select to authenticated
  using (auth.uid() in (buyer_id, seller_id) or public.is_admin());

-- Called by the Stripe webhook (service role) when a Checkout payment succeeds.
-- Idempotent per Checkout session. Returns 'recorded', 'duplicate' or
-- 'unavailable' (already sold: the caller refunds the payment).
create function public.record_card_payment(
  p_session_id text,
  p_payment_intent_id text,
  p_listing_id uuid,
  p_buyer_id uuid,
  p_amount_cents integer,
  p_fee_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
  v_conversation_id uuid;
begin
  if exists (select 1 from public.orders o where o.stripe_session_id = p_session_id) then
    return 'duplicate';
  end if;

  select * into v_listing from public.listings l where l.id = p_listing_id for update;
  if not found then
    raise exception 'listing not found' using errcode = 'no_data_found';
  end if;

  if v_listing.status not in ('active', 'reserved') or v_listing.seller_id = p_buyer_id then
    insert into public.orders (listing_id, buyer_id, seller_id, amount_cents, fee_cents, currency,
                               stripe_session_id, stripe_payment_intent_id, status)
    values (p_listing_id, p_buyer_id, v_listing.seller_id, p_amount_cents, p_fee_cents, upper(p_currency),
            p_session_id, p_payment_intent_id, 'refund_needed');
    return 'unavailable';
  end if;

  insert into public.orders (listing_id, buyer_id, seller_id, amount_cents, fee_cents, currency,
                             stripe_session_id, stripe_payment_intent_id, status)
  values (p_listing_id, p_buyer_id, v_listing.seller_id, p_amount_cents, p_fee_cents, upper(p_currency),
          p_session_id, p_payment_intent_id, 'paid');

  update public.listings
  set status = 'sold', sold_at = now(), at_market = false
  where id = p_listing_id;

  insert into public.transactions (listing_id, seller_id, buyer_id, price_cents, currency, campus_id, channel)
  values (p_listing_id, v_listing.seller_id, p_buyer_id, p_amount_cents, v_listing.currency, v_listing.campus_id, 'in_app');

  -- Open (or reuse) the chat so buyer and seller can arrange the pickup.
  if p_buyer_id is not null then
    insert into public.conversations (listing_id, buyer_id, seller_id)
    values (p_listing_id, p_buyer_id, v_listing.seller_id)
    on conflict (listing_id, buyer_id) do update set listing_id = excluded.listing_id
    returning id into v_conversation_id;

    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, p_buyer_id,
            'I just paid for "' || v_listing.title || '" by card in the app. When can I pick it up?');
  end if;

  return 'recorded';
end;
$$;

revoke execute on function public.record_card_payment(text, text, uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_card_payment(text, text, uuid, uuid, integer, integer, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Experiment metrics: add the in-app channel and platform revenue.
-- ---------------------------------------------------------------------------
create or replace function public.experiment_metrics(p_campus_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;

  with
  p as (select * from public.profiles where p_campus_id is null or campus_id = p_campus_id),
  l as (select * from public.listings where p_campus_id is null or campus_id = p_campus_id),
  t as (select * from public.transactions where p_campus_id is null or campus_id = p_campus_id),
  c as (
    select cv.* from public.conversations cv
    join public.listings li on li.id = cv.listing_id
    where p_campus_id is null or li.campus_id = p_campus_id
  ),
  o as (
    select od.* from public.orders od
    join public.listings li on li.id = od.listing_id
    where od.status = 'paid' and (p_campus_id is null or li.campus_id = p_campus_id)
  ),
  r as (select * from public.market_rsvps where p_campus_id is null or campus_id = p_campus_id),
  weeks as (
    select generate_series(
      date_trunc('week', now()) - interval '7 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) as week
  ),
  buyer_counts as (
    select buyer_id, count(*) as n from t where buyer_id is not null group by buyer_id
  )
  select jsonb_build_object(
    'students', (select count(*) from p),
    'sellers', (select count(distinct seller_id) from l),
    'buyers', (select count(*) from buyer_counts),
    'repeat_buyers', (select count(*) from buyer_counts where n >= 2),
    'listings_total', (select count(*) from l where status <> 'removed'),
    'listings_active', (select count(*) from l where status in ('active', 'reserved')),
    'listings_at_market', (select count(*) from l where at_market and status in ('active', 'reserved')),
    'conversations', (select count(*) from c),
    'transactions', (select count(*) from t),
    'transactions_at_market', (select count(*) from t where channel = 'sunday_market'),
    'transactions_in_app', (select count(*) from t where channel = 'in_app'),
    'sell_through_rate', (
      select case when count(*) = 0 then 0
             else round(count(*) filter (where status = 'sold')::numeric / count(*), 4) end
      from l where status <> 'removed'
    ),
    'contact_to_sale_rate', (
      select case when (select count(distinct listing_id) from c) = 0 then 0
             else round((select count(*) from t where listing_id in (select listing_id from c))::numeric
                        / (select count(distinct listing_id) from c), 4) end
    ),
    'median_hours_to_sell', (
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from (l.sold_at - l.created_at)) / 3600))::numeric, 1)
      from l where l.status = 'sold' and l.sold_at is not null
    ),
    'gmv', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', currency,
        'total_cents', total,
        'avg_cents', avg_cents,
        'count', n) order by currency)
      from (
        select currency, sum(price_cents) as total, round(avg(price_cents)) as avg_cents, count(*) as n
        from t group by currency
      ) g
    ), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'total_cents', total) order by currency)
      from (select currency, sum(fee_cents) as total from o group by currency) f
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'listings', listings, 'sold', sold)
                       order by listings desc)
      from (
        select category, count(*) as listings, count(*) filter (where status = 'sold') as sold
        from l where status <> 'removed' group by category
      ) bc
    ), '[]'::jsonb),
    'market_rsvps', (select count(*) from r),
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w.week, 'YYYY-MM-DD'),
        'signups', (select count(*) from p where date_trunc('week', p.created_at) = w.week),
        'listings', (select count(*) from l where date_trunc('week', l.created_at) = w.week),
        'transactions', (select count(*) from t where date_trunc('week', t.created_at) = w.week)
      ) order by w.week)
      from weeks w
    )
  ) into v_result;

  return v_result;
end;
$$;

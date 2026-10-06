-- Transactions (the MVP's key metric), the weekly Sunday Market, and the
-- experiment dashboard numbers.

-- ---------------------------------------------------------------------------
-- Transactions: written only by mark_listing_sold()
-- ---------------------------------------------------------------------------
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null unique references public.listings (id) on delete cascade,
  seller_id    uuid not null references public.profiles (id) on delete cascade,
  -- Null when the buyer is not on Broke2Broke (e.g. sold to a walk-in at the market).
  buyer_id     uuid references public.profiles (id) on delete set null,
  price_cents  integer not null check (price_cents between 0 and 10000000),
  currency     text not null,
  campus_id    text not null references public.campuses (id),
  -- Where the handover happened.
  channel      text not null check (channel in ('meetup', 'sunday_market')),
  created_at   timestamptz not null default now()
);

create index transactions_created_idx on public.transactions (created_at);

alter table public.transactions enable row level security;
grant select on public.transactions to authenticated;

create policy "parties see their transactions" on public.transactions
  for select to authenticated
  using (auth.uid() in (seller_id, buyer_id) or public.is_admin());

create function public.mark_listing_sold(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_price_cents integer,
  p_channel text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.listings;
  v_tx_id uuid;
begin
  select * into v_listing from public.listings l where l.id = p_listing_id for update;
  if not found or v_listing.seller_id is distinct from v_uid then
    raise exception 'only the seller can mark this listing as sold' using errcode = 'insufficient_privilege';
  end if;
  if v_listing.status not in ('active', 'reserved') then
    raise exception 'listing is not available' using errcode = 'check_violation';
  end if;
  if p_channel not in ('meetup', 'sunday_market') then
    raise exception 'invalid channel' using errcode = 'check_violation';
  end if;
  if p_price_cents is null or p_price_cents < 0 or p_price_cents > 10000000 then
    raise exception 'invalid price' using errcode = 'check_violation';
  end if;
  -- A buyer can only be credited if they actually talked to the seller about it.
  if p_buyer_id is not null and not exists (
    select 1 from public.conversations c
    where c.listing_id = p_listing_id and c.buyer_id = p_buyer_id
  ) then
    raise exception 'buyer did not contact you about this listing' using errcode = 'check_violation';
  end if;

  update public.listings
  set status = 'sold', sold_at = now(), at_market = false
  where id = p_listing_id;

  insert into public.transactions (listing_id, seller_id, buyer_id, price_cents, currency, campus_id, channel)
  values (p_listing_id, v_uid, p_buyer_id, p_price_cents, v_listing.currency, v_listing.campus_id, p_channel)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke execute on function public.mark_listing_sold(uuid, uuid, integer, text) from public, anon;
grant execute on function public.mark_listing_sold(uuid, uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sunday Market
-- ---------------------------------------------------------------------------
-- Optional details for a given Sunday (place and time). If there is no row
-- the app still shows the market, with the location "to be announced".
create table public.market_days (
  id           uuid primary key default gen_random_uuid(),
  campus_id    text not null references public.campuses (id),
  market_date  date not null check (extract(isodow from market_date) = 7),
  location     text not null check (char_length(location) between 2 and 120),
  starts_at    time not null default '11:00',
  ends_at      time not null default '15:00',
  notes        text check (char_length(notes) <= 500),
  cancelled    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (campus_id, market_date),
  check (ends_at > starts_at)
);

create table public.market_rsvps (
  campus_id    text not null references public.campuses (id),
  market_date  date not null check (extract(isodow from market_date) = 7),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  going_as     text not null check (going_as in ('buyer', 'seller')),
  created_at   timestamptz not null default now(),
  primary key (campus_id, market_date, user_id)
);

alter table public.market_days enable row level security;
alter table public.market_rsvps enable row level security;

grant select, insert, update, delete on public.market_days to authenticated;
grant select, delete on public.market_rsvps to authenticated;
grant insert (campus_id, market_date, going_as), update (going_as) on public.market_rsvps to authenticated;

create policy "students see market days" on public.market_days
  for select to authenticated using (true);

create policy "admins manage market days" on public.market_days
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "students see who is going" on public.market_rsvps
  for select to authenticated using (true);

create policy "students rsvp for upcoming markets" on public.market_rsvps
  for insert to authenticated
  with check (user_id = auth.uid() and market_date >= current_date - 1);

create policy "students change own rsvp" on public.market_rsvps
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "students cancel own rsvp" on public.market_rsvps
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Experiment dashboard (admins only)
-- "Will students prefer a marketplace where they can buy/sell specifically
--  with other nearby verified students?"
-- ---------------------------------------------------------------------------
create function public.experiment_metrics(p_campus_id text default null)
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

revoke execute on function public.experiment_metrics(text) from public, anon;
grant execute on function public.experiment_metrics(text) to authenticated;

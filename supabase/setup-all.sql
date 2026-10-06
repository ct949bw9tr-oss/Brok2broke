-- Broke2Broke: full database setup for a NEW Supabase project.
-- Paste this whole file into Supabase > SQL Editor and click Run (run it once).
-- Generated from supabase/migrations/ by concatenating them in order.

-- ======================================================================
-- 20261006000001_core.sql
-- ======================================================================
-- Broke2Broke core schema: who can join, campuses, and student profiles.
--
-- Only people with a verified university email can have an account. The
-- check runs in the database (trigger on auth.users), so it holds even if
-- someone calls the Supabase Auth API directly instead of using the app.

-- ---------------------------------------------------------------------------
-- Universities / email domains allowed to sign up
-- ---------------------------------------------------------------------------
create table public.allowed_email_domains (
  domain      text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  university  text not null,
  created_at  timestamptz not null default now()
);

insert into public.allowed_email_domains (domain, university) values
  ('student.hult.edu', 'Hult International Business School'),
  ('hult.edu', 'Hult International Business School');

create function public.email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_email_domains d
    where d.domain = split_part(lower(trim(p_email)), '@', 2)
  );
$$;

-- ---------------------------------------------------------------------------
-- Campuses (each has its own currency and Sunday Market)
-- ---------------------------------------------------------------------------
create table public.campuses (
  id          text primary key check (id ~ '^[a-z_]+$'),
  name        text not null,
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  timezone    text not null,
  sort_order  integer not null default 0
);

insert into public.campuses (id, name, currency, timezone, sort_order) values
  ('boston', 'Boston', 'USD', 'America/New_York', 1),
  ('london', 'London', 'GBP', 'Europe/London', 2),
  ('dubai', 'Dubai', 'AED', 'Asia/Dubai', 3),
  ('san_francisco', 'San Francisco', 'USD', 'America/Los_Angeles', 4);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Email stays in auth.users so classmates
-- never see each other's addresses.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  campus_id   text references public.campuses (id),
  program     text check (char_length(program) <= 80),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- "maria.lopez2027@student.hult.edu" -> "Maria Lopez"
create function public.name_from_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(initcap(trim(regexp_replace(
    regexp_replace(split_part(p_email, '@', 1), '[0-9]+', '', 'g'),
    '[._+-]+', ' ', 'g'))), 80);
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not public.email_domain_allowed(new.email) then
    raise exception 'Broke2Broke is only open to verified university emails'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, public.name_from_email(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.allowed_email_domains enable row level security;
alter table public.campuses enable row level security;
alter table public.profiles enable row level security;

grant select on public.allowed_email_domains to anon, authenticated;
grant select on public.campuses to anon, authenticated;
grant select on public.profiles to authenticated;
-- Students edit their own name/campus/program; never is_admin.
grant update (full_name, campus_id, program) on public.profiles to authenticated;

create policy "domains are public" on public.allowed_email_domains
  for select to anon, authenticated using (true);

create policy "campuses are public" on public.campuses
  for select to anon, authenticated using (true);

create policy "verified students see profiles" on public.profiles
  for select to authenticated using (true);

create policy "students edit own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.email_domain_allowed(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ======================================================================
-- 20261006000002_marketplace.sql
-- ======================================================================
-- Listings, saved items, conversations and messages.

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  campus_id    text not null references public.campuses (id),
  title        text not null check (char_length(title) between 3 and 80),
  description  text not null default '' check (char_length(description) <= 2000),
  category     text not null check (category in
                 ('clothing', 'books', 'electronics', 'furniture', 'home', 'tickets', 'sports', 'beauty', 'other')),
  condition    text not null check (condition in ('new', 'like_new', 'good', 'fair')),
  kind         text not null default 'sell' check (kind in ('sell', 'swap', 'free')),
  price_cents  integer not null default 0 check (price_cents between 0 and 10000000),
  currency     text not null default 'USD',
  photos       text[] not null default '{}' check (cardinality(photos) <= 6),
  -- Seller plans to bring it to the next Sunday Market on their campus.
  at_market    boolean not null default false,
  status       text not null default 'active' check (status in ('active', 'reserved', 'sold', 'removed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  sold_at      timestamptz,
  constraint listings_price_matches_kind check (
    (kind = 'sell' and price_cents > 0) or (kind <> 'sell' and price_cents = 0)
  )
);

create index listings_feed_idx on public.listings (campus_id, status, created_at desc);
create index listings_seller_idx on public.listings (seller_id, created_at desc);

create function public.listings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  photo text;
begin
  -- Currency always follows the campus.
  select c.currency into new.currency from public.campuses c where c.id = new.campus_id;

  -- Photos must live in the seller's own storage folder.
  foreach photo in array new.photos loop
    if photo not like new.seller_id::text || '/%' or photo like '%..%' then
      raise exception 'invalid photo path' using errcode = 'check_violation';
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    if new.seller_id <> old.seller_id then
      raise exception 'seller cannot change' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_before_write
  before insert or update on public.listings
  for each row execute function public.listings_before_write();

alter table public.listings enable row level security;

grant select on public.listings to authenticated;
grant insert (campus_id, title, description, category, condition, kind, price_cents, photos, at_market)
  on public.listings to authenticated;
grant update (campus_id, title, description, category, condition, kind, price_cents, photos, at_market, status)
  on public.listings to authenticated;

create policy "students see listings" on public.listings
  for select to authenticated
  using (status <> 'removed' or seller_id = auth.uid());

create policy "students create own listings" on public.listings
  for insert to authenticated
  with check (seller_id = auth.uid() and status = 'active');

-- Sold is final and only reachable through mark_listing_sold(), which also
-- records the transaction.
create policy "sellers edit own unsold listings" on public.listings
  for update to authenticated
  using (seller_id = auth.uid() and status <> 'sold')
  with check (seller_id = auth.uid() and status <> 'sold');

-- ---------------------------------------------------------------------------
-- Saved listings (favorites)
-- ---------------------------------------------------------------------------
create table public.saved_listings (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id  uuid not null references public.listings (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.saved_listings enable row level security;
grant select, delete on public.saved_listings to authenticated;
grant insert (listing_id) on public.saved_listings to authenticated;

create policy "students manage own saves" on public.saved_listings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Conversations (one per listing + buyer) and messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references public.listings (id) on delete cascade,
  buyer_id             uuid not null references public.profiles (id) on delete cascade,
  seller_id            uuid not null references public.profiles (id) on delete cascade,
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz not null default now(),
  buyer_last_read_at   timestamptz not null default now(),
  seller_last_read_at  timestamptz not null default '-infinity',
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body             text not null check (char_length(trim(body)) between 1 and 2000),
  created_at       timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and auth.uid() in (c.buyer_id, c.seller_id)
  );
$$;

create function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      buyer_last_read_at = case when new.sender_id = c.buyer_id then new.created_at else c.buyer_last_read_at end,
      seller_last_read_at = case when new.sender_id = c.seller_id then new.created_at else c.seller_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

create policy "members see conversations" on public.conversations
  for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));

create policy "members see messages" on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "members send messages" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Start (or reuse) the conversation about a listing and send the first message.
create function public.contact_seller(p_listing_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.listings;
  v_conversation_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_listing from public.listings l where l.id = p_listing_id;
  if not found or v_listing.status not in ('active', 'reserved') then
    raise exception 'listing is not available' using errcode = 'no_data_found';
  end if;
  if v_listing.seller_id = v_uid then
    raise exception 'you cannot message yourself' using errcode = 'check_violation';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (p_listing_id, v_uid, v_listing.seller_id)
  on conflict (listing_id, buyer_id) do update set listing_id = excluded.listing_id
  returning id into v_conversation_id;

  insert into public.messages (conversation_id, sender_id, body)
  values (v_conversation_id, v_uid, p_body);

  return v_conversation_id;
end;
$$;

create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations c
  set buyer_last_read_at = case when c.buyer_id = auth.uid() then now() else c.buyer_last_read_at end,
      seller_last_read_at = case when c.seller_id = auth.uid() then now() else c.seller_last_read_at end
  where c.id = p_conversation_id and auth.uid() in (c.buyer_id, c.seller_id);
$$;

create function public.unread_conversation_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.conversations c
  where (c.buyer_id = auth.uid() and c.last_message_at > c.buyer_last_read_at)
     or (c.seller_id = auth.uid() and c.last_message_at > c.seller_last_read_at);
$$;

revoke execute on function public.contact_seller(uuid, text) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.unread_conversation_count() from public, anon;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.messages_after_insert() from public, anon, authenticated;
grant execute on function public.contact_seller(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.unread_conversation_count() to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- ======================================================================
-- 20261006000003_sales_and_market.sql
-- ======================================================================
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

-- ======================================================================
-- 20261006000004_storage.sql
-- ======================================================================
-- Listing photos bucket. Public read (URLs are unguessable UUIDs), and each
-- student can only write inside their own folder: <user id>/<file>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "students upload own listing photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "students delete own listing photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ======================================================================
-- 20261006000005_open_signup.sql
-- ======================================================================
-- Open sign-up: an EMPTY allowed_email_domains table now means "any email
-- can join". To restrict again, insert the domains, e.g.
--   insert into public.allowed_email_domains (domain, university)
--   values ('student.hult.edu', 'Hult International Business School');

create or replace function public.email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.allowed_email_domains)
      or exists (
        select 1
        from public.allowed_email_domains d
        where d.domain = split_part(lower(trim(p_email)), '@', 2)
      );
$$;

delete from public.allowed_email_domains;

-- ======================================================================
-- 20261006000006_card_payments.sql
-- ======================================================================
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

-- ======================================================================
-- 20261006000007_lobby_pickup.sql
-- ======================================================================
-- After a card payment the buyer and seller meet in their campus lobby:
-- the automatic chat message now says so.

create or replace function public.record_card_payment(
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
  v_campus_name text;
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

  select c.name into v_campus_name from public.campuses c where c.id = v_listing.campus_id;

  -- Open (or reuse) the chat so buyer and seller can agree on a time.
  if p_buyer_id is not null then
    insert into public.conversations (listing_id, buyer_id, seller_id)
    values (p_listing_id, p_buyer_id, v_listing.seller_id)
    on conflict (listing_id, buyer_id) do update set listing_id = excluded.listing_id
    returning id into v_conversation_id;

    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, p_buyer_id,
            'Paid by card for "' || v_listing.title || '". Let''s meet in the ' || coalesce(v_campus_name, 'campus')
            || ' campus lobby. What time works for you?');
  end if;

  return 'recorded';
end;
$$;

revoke execute on function public.record_card_payment(text, text, uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_card_payment(text, text, uuid, uuid, integer, integer, text)
  to service_role;

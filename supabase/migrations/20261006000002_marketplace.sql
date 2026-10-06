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

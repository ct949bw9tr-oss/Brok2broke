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

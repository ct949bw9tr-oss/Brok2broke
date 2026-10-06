-- Listing visibility and ownership.

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
set local role authenticated;

select tests.assert_eq((select count(*) from public.listings), 2::bigint, 'removed listings are hidden from others');

insert into public.listings (campus_id, title, category, condition, kind, price_cents)
values ('london', 'Bike helmet', 'sports', 'good', 'sell', 2500);
select tests.assert_eq(
  (select currency from public.listings where title = 'Bike helmet'), 'GBP', 'currency follows the campus');
select tests.assert_eq(
  (select seller_id from public.listings where title = 'Bike helmet'),
  '00000000-0000-0000-0000-0000000000b0'::uuid, 'seller defaults to the signed-in student');

do $$
begin
  insert into public.listings (seller_id, campus_id, title, category, condition, kind, price_cents)
  values ('00000000-0000-0000-0000-0000000000a1', 'boston', 'Fake', 'other', 'good', 'sell', 100);
  raise exception 'FAILED: created a listing for someone else';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  insert into public.listings (campus_id, title, category, condition, kind, price_cents, photos)
  values ('boston', 'Stolen photo', 'other', 'good', 'sell', 100, array['00000000-0000-0000-0000-0000000000a1/lamp.jpg']);
  raise exception 'FAILED: used a photo from another student folder';
exception when check_violation then null;
end;
$$;

do $$
begin
  insert into public.listings (campus_id, title, category, condition, kind, price_cents)
  values ('boston', 'Free but priced', 'other', 'good', 'free', 500);
  raise exception 'FAILED: free listing with a price';
exception when check_violation then null;
end;
$$;

-- Cannot edit someone else's listing (silently matches no rows).
update public.listings set price_cents = 1 where id = '00000000-0000-0000-0001-000000000001';
reset role;
select tests.assert_eq((select price_cents from public.listings where id = '00000000-0000-0000-0001-000000000001'),
  1500, 'student cannot edit another student listing');
rollback;

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select tests.assert_eq((select count(*) from public.listings), 3::bigint, 'seller still sees own removed listing');

update public.listings set price_cents = 1200 where id = '00000000-0000-0000-0001-000000000001';
select tests.assert_eq((select price_cents from public.listings where id = '00000000-0000-0000-0001-000000000001'),
  1200, 'seller can edit own listing');

-- Sold can only be set through mark_listing_sold().
do $$
begin
  update public.listings set status = 'sold' where id = '00000000-0000-0000-0001-000000000001';
  raise exception 'FAILED: seller set status sold directly';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  delete from public.listings where id = '00000000-0000-0000-0001-000000000001';
  raise exception 'FAILED: seller hard-deleted a listing';
exception when insufficient_privilege then null;
end;
$$;
rollback;

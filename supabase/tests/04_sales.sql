-- Marking listings sold records a transaction.

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
set local role authenticated;
do $$
begin
  perform public.mark_listing_sold('00000000-0000-0000-0001-000000000001', null, 1500, 'meetup');
  raise exception 'FAILED: non-seller marked a listing sold';
exception when insufficient_privilege then null;
end;
$$;

select tests.login_as('00000000-0000-0000-0000-0000000000a1');
do $$
begin
  perform public.mark_listing_sold('00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-0000000000c0', 1500, 'meetup');
  raise exception 'FAILED: credited a buyer who never made contact';
exception when check_violation then null;
end;
$$;

select public.mark_listing_sold('00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-0000000000b0', 1300, 'sunday_market');
select tests.assert_eq((select status from public.listings where id = '00000000-0000-0000-0001-000000000001'),
  'sold', 'listing is sold');
select tests.assert_eq((select count(*) from public.transactions), 1::bigint, 'seller sees the transaction');

do $$
begin
  perform public.mark_listing_sold('00000000-0000-0000-0001-000000000001', null, 1300, 'meetup');
  raise exception 'FAILED: sold twice';
exception when check_violation then null;
end;
$$;

-- Sold is final.
update public.listings set status = 'active' where id = '00000000-0000-0000-0001-000000000001';
select tests.assert_eq((select status from public.listings where id = '00000000-0000-0000-0001-000000000001'),
  'sold', 'sold listing cannot be reopened');

select tests.login_as('00000000-0000-0000-0000-0000000000b0');
select tests.assert_eq((select count(*) from public.transactions), 1::bigint, 'buyer sees the transaction');
select tests.login_as('00000000-0000-0000-0000-0000000000c0');
select tests.assert_eq((select count(*) from public.transactions), 0::bigint, 'others do not');

do $$
begin
  perform public.experiment_metrics();
  raise exception 'FAILED: student read experiment metrics';
exception when insufficient_privilege then null;
end;
$$;

select tests.login_as('00000000-0000-0000-0000-0000000000ad');
select tests.assert_eq((public.experiment_metrics() ->> 'transactions')::int, 1, 'admin sees transactions');
select tests.assert_eq((public.experiment_metrics() ->> 'transactions_at_market')::int, 1, 'market channel counted');
select tests.assert_eq((public.experiment_metrics() ->> 'repeat_buyers')::int, 0, 'no repeat buyers yet');
select tests.assert_eq((public.experiment_metrics('london') ->> 'transactions')::int, 0, 'campus filter works');
select tests.assert_eq(jsonb_array_length(public.experiment_metrics() -> 'weekly'), 8, 'eight weeks of history');
select tests.assert_eq((public.experiment_metrics() -> 'gmv' -> 0 ->> 'total_cents')::int, 1300, 'gmv is the sale price');
rollback;

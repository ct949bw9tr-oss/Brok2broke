-- Card payments: only the server (service role) records them.

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
set local role authenticated;

select tests.assert_eq(public.seller_accepts_cards('00000000-0000-0000-0000-0000000000a1'), false,
  'seller without payout account does not accept cards');

do $$
begin
  perform public.record_card_payment('cs_fake', 'pi_fake', '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-0000000000b0', 1500, 150, 'usd');
  raise exception 'FAILED: a student recorded a card payment';
exception when insufficient_privilege then null;
end;
$$;

do $$
begin
  insert into public.payout_accounts (user_id, stripe_account_id, country, ready)
  values (auth.uid(), 'acct_fake', 'US', true);
  raise exception 'FAILED: a student created a payout account row';
exception when insufficient_privilege then null;
end;
$$;

reset role;
insert into public.payout_accounts (user_id, stripe_account_id, country, ready)
values ('00000000-0000-0000-0000-0000000000a1', 'acct_alice', 'US', true);
set local role authenticated;
select tests.assert_eq(public.seller_accepts_cards('00000000-0000-0000-0000-0000000000a1'), true,
  'ready seller accepts cards');
select tests.assert_eq((select count(*) from public.payout_accounts), 0::bigint,
  'students cannot see other payout accounts');

-- The webhook (service role) records Bob's payment.
reset role;
set local role service_role;
select tests.assert_eq(
  public.record_card_payment('cs_1', 'pi_1', '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-0000000000b0', 1500, 150, 'usd'),
  'recorded', 'payment recorded');
select tests.assert_eq(
  public.record_card_payment('cs_1', 'pi_1', '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-0000000000b0', 1500, 150, 'usd'),
  'duplicate', 'same session is idempotent');
select tests.assert_eq(
  public.record_card_payment('cs_2', 'pi_2', '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-0000000000c0', 1500, 150, 'usd'),
  'unavailable', 'second buyer of a sold item gets refunded');
reset role;

select tests.assert_eq((select status from public.listings where id = '00000000-0000-0000-0001-000000000001'),
  'sold', 'listing is sold');
select tests.assert_eq((select channel from public.transactions where listing_id = '00000000-0000-0000-0001-000000000001'),
  'in_app', 'transaction recorded as in-app');
select tests.assert_eq((select status from public.orders where stripe_session_id = 'cs_2'),
  'refund_needed', 'late payment is flagged for refund');
select tests.assert_true((select count(*) from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.buyer_id = '00000000-0000-0000-0000-0000000000b0' and m.body like 'I just paid%') = 1,
  'buyer and seller get a pickup chat message');

select tests.login_as('00000000-0000-0000-0000-0000000000c0');
set local role authenticated;
select tests.assert_eq((select count(*) from public.orders where status = 'paid'), 0::bigint,
  'outsiders do not see the order');
select tests.login_as('00000000-0000-0000-0000-0000000000ad');
select tests.assert_eq((public.experiment_metrics() ->> 'transactions_in_app')::int, 1, 'metrics count in-app sales');
select tests.assert_eq((public.experiment_metrics() -> 'fees' -> 0 ->> 'total_cents')::int, 150, 'metrics count platform fees');
rollback;

-- Conversations are private to buyer and seller.

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000c0');
set local role authenticated;
select tests.assert_eq((select count(*) from public.conversations), 0::bigint, 'outsider sees no conversations');
select tests.assert_eq((select count(*) from public.messages), 0::bigint, 'outsider sees no messages');

do $$
begin
  insert into public.messages (conversation_id, body) values ('00000000-0000-0000-0002-000000000001', 'spam');
  raise exception 'FAILED: outsider posted in a conversation';
exception when insufficient_privilege then null;
end;
$$;

-- Carol contacts Alice about the lamp.
select public.contact_seller('00000000-0000-0000-0001-000000000001', 'Hi! Can I see it Sunday?');
select tests.assert_eq((select count(*) from public.conversations), 1::bigint, 'buyer sees own new conversation');
-- Contacting again reuses the conversation.
select public.contact_seller('00000000-0000-0000-0001-000000000001', 'Still keen');
select tests.assert_eq((select count(*) from public.conversations), 1::bigint, 'one conversation per listing and buyer');
select tests.assert_eq((select count(*) from public.messages), 2::bigint, 'both messages are in it');

do $$
begin
  perform public.contact_seller('00000000-0000-0000-0001-000000000003', 'me');
  raise exception 'FAILED: seller messaged themselves';
exception when check_violation then null;
end;
$$;

do $$
begin
  perform public.contact_seller('00000000-0000-0000-0001-000000000002', 'removed?');
  raise exception 'FAILED: contacted a removed listing';
exception when no_data_found then null;
end;
$$;
rollback;

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select tests.assert_eq(public.unread_conversation_count(), 1, 'seller has an unread conversation');
insert into public.messages (conversation_id, body) values ('00000000-0000-0000-0002-000000000001', 'Yes it is!');
select tests.assert_eq(public.unread_conversation_count(), 0, 'replying marks the conversation read');
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
select tests.assert_eq(public.unread_conversation_count(), 1, 'buyer now has an unread reply');
select public.mark_conversation_read('00000000-0000-0000-0002-000000000001');
select tests.assert_eq(public.unread_conversation_count(), 0, 'mark read clears it');
rollback;

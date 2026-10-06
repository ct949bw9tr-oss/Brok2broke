-- Fixture used by every database test. Loaded as the database owner
-- (bypasses RLS). IDs are fixed so tests can reference them.
--
--   alice  Boston student, sells a lamp (active) and a jacket (removed)
--   bob    Boston student, asked alice about the lamp
--   carol  London student, sells a textbook
--   admin  Broke2Broke team member (is_admin)

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Impersonate a user for the rest of the current transaction.
-- Call as the owner, then `set local role authenticated`.
create function tests.login_as(p_user_id uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
$$;

create function tests.assert_eq(actual anyelement, expected anyelement, message text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % (expected %, got %)', message, expected, actual;
  end if;
end;
$$;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'FAILED: %', message;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts (auth.users -> profiles via trigger)
-- ---------------------------------------------------------------------------
-- Restricted mode (the open-signup migration empties this table).
insert into public.allowed_email_domains (domain, university) values
  ('student.hult.edu', 'Hult International Business School'),
  ('hult.edu', 'Hult International Business School');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice.smith@student.hult.edu'),
  ('00000000-0000-0000-0000-0000000000b0', 'bob.jones2027@student.hult.edu'),
  ('00000000-0000-0000-0000-0000000000c0', 'carol@student.hult.edu'),
  ('00000000-0000-0000-0000-0000000000ad', 'team@hult.edu');

update public.profiles set campus_id = 'boston' where id in
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b0');
update public.profiles set campus_id = 'london' where id = '00000000-0000-0000-0000-0000000000c0';
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000ad';

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
insert into public.listings (id, seller_id, campus_id, title, category, condition, kind, price_cents, photos, status) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-0000000000a1', 'boston',
   'Desk lamp', 'home', 'good', 'sell', 1500, array['00000000-0000-0000-0000-0000000000a1/lamp.jpg'], 'active'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-0000000000a1', 'boston',
   'Old jacket', 'clothing', 'fair', 'free', 0, '{}', 'removed'),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-0000000000c0', 'london',
   'Finance textbook', 'books', 'like_new', 'sell', 2000, '{}', 'active');

insert into public.conversations (id, listing_id, buyer_id, seller_id) values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001',
   '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000a1');

insert into public.messages (conversation_id, sender_id, body) values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-0000000000b0', 'Is the lamp still available?');

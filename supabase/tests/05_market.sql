-- Sunday Market RSVPs and admin-managed market details.

begin;
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
set local role authenticated;

insert into public.market_rsvps (campus_id, market_date, going_as)
values ('boston', current_date + (7 - extract(isodow from current_date)::int), 'buyer');
select tests.assert_eq((select count(*) from public.market_rsvps), 1::bigint, 'student can rsvp');

do $$
begin
  insert into public.market_rsvps (campus_id, market_date, going_as)
  values ('boston', current_date + (8 - extract(isodow from current_date)::int), 'buyer');
  raise exception 'FAILED: rsvp for a non-Sunday';
exception when check_violation then null;
end;
$$;

do $$
begin
  insert into public.market_days (campus_id, market_date, location)
  values ('boston', current_date + (7 - extract(isodow from current_date)::int), 'Lobby');
  raise exception 'FAILED: student created a market day';
exception when insufficient_privilege then null;
end;
$$;

select tests.login_as('00000000-0000-0000-0000-0000000000ad');
insert into public.market_days (campus_id, market_date, location)
values ('boston', current_date + (7 - extract(isodow from current_date)::int), 'Main lobby');
select tests.assert_eq((select count(*) from public.market_days), 1::bigint, 'admin can create a market day');
rollback;

-- Storage: students can only upload into their own folder.
begin;
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('listing-photos', '00000000-0000-0000-0000-0000000000b0/a.jpg');
do $$
begin
  insert into storage.objects (bucket_id, name) values ('listing-photos', '00000000-0000-0000-0000-0000000000a1/a.jpg');
  raise exception 'FAILED: uploaded into another student folder';
exception when insufficient_privilege then null;
end;
$$;
rollback;

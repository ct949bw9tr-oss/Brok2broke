-- With allowed domains configured, only those emails can create an account.

begin;
select tests.assert_eq(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b0'),
  'Bob Jones', 'profile name is derived from the email');

do $$
begin
  insert into auth.users (email) values ('someone@gmail.com');
  raise exception 'FAILED: a non-university email signed up';
exception when check_violation then null;
end;
$$;

do $$
begin
  insert into auth.users (email) values ('spoof@student.hult.edu.evil.com');
  raise exception 'FAILED: a look-alike domain signed up';
exception when check_violation then null;
end;
$$;

insert into auth.users (email) values ('New.Student@Student.Hult.edu');
select tests.assert_eq((select count(*) from public.profiles), 5::bigint, 'mixed-case university email can sign up');
rollback;

-- With no allowed domains (open sign-up), any email can join.
begin;
delete from public.allowed_email_domains;
insert into auth.users (email) values ('someone@gmail.com');
select tests.assert_eq((select count(*) from public.profiles), 5::bigint, 'open sign-up accepts any email');
rollback;

-- Students cannot make themselves admin or edit other profiles.
begin;
select tests.login_as('00000000-0000-0000-0000-0000000000b0');
set local role authenticated;

do $$
begin
  update public.profiles set is_admin = true where id = auth.uid();
  raise exception 'FAILED: student made themselves admin';
exception when insufficient_privilege then null;
end;
$$;

update public.profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set program = 'MBA' where id = auth.uid();
reset role;
select tests.assert_eq((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Alice Smith', 'student cannot edit another profile');
select tests.assert_eq((select program from public.profiles where id = '00000000-0000-0000-0000-0000000000b0'),
  'MBA', 'student can edit own profile');
rollback;

-- Anonymous visitors cannot read profiles or listings.
begin;
set local role anon;
do $$
begin
  perform count(*) from public.listings;
  raise exception 'FAILED: anon read listings';
exception when insufficient_privilege then null;
end;
$$;
select tests.assert_eq((select count(*) from public.campuses), 4::bigint, 'anon can read campuses');
rollback;

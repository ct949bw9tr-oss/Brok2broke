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

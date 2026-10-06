-- Open sign-up: an EMPTY allowed_email_domains table now means "any email
-- can join". To restrict again, insert the domains, e.g.
--   insert into public.allowed_email_domains (domain, university)
--   values ('student.hult.edu', 'Hult International Business School');

create or replace function public.email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.allowed_email_domains)
      or exists (
        select 1
        from public.allowed_email_domains d
        where d.domain = split_part(lower(trim(p_email)), '@', 2)
      );
$$;

delete from public.allowed_email_domains;

-- Adds the client industry selector used to choose the industry-specific
-- Chart-of-Accounts default preset. Safe to run on an existing CAPOT database.

alter table public.clients
  add column if not exists industry text;

update public.clients
set industry = 'general-services'
where industry is null or trim(industry) = '';

alter table public.clients
  alter column industry set default 'general-services',
  alter column industry set not null;

alter table public.clients
  drop constraint if exists clients_industry_check;

alter table public.clients
  add constraint clients_industry_check
    check (industry in ('retail', 'general-services', 'manufacturing', 'construction'));

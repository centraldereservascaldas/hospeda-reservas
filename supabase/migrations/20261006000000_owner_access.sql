-- Owner access is approved and managed only by the server/service role.
-- A verified guest account alone must never grant access to owner finances.
create table if not exists public.owner_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  stays_owner_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'approved' and stays_owner_id is not null) or status <> 'approved')
);

alter table public.owner_access enable row level security;
revoke all on public.owner_access from anon, authenticated;
grant all on public.owner_access to service_role;

create or replace function public.set_owner_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_access_updated_at on public.owner_access;
create trigger owner_access_updated_at
  before update on public.owner_access
  for each row execute function public.set_owner_access_updated_at();

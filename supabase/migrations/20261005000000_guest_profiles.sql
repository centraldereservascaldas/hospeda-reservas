-- Server-managed mapping between a verified Supabase guest and their Stays client.
-- The service role writes this table; browser clients must never be able to enumerate it.
create table if not exists public.guest_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  stays_client_id text unique,
  stays_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guest_profiles enable row level security;

drop policy if exists "Guests can read their own profile" on public.guest_profiles;
create policy "Guests can read their own profile"
  on public.guest_profiles for select
  to authenticated
  using (auth.uid() = id);

revoke all on public.guest_profiles from anon, authenticated;
grant select on public.guest_profiles to authenticated;

create or replace function public.set_guest_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guest_profiles_updated_at on public.guest_profiles;
create trigger guest_profiles_updated_at
  before update on public.guest_profiles
  for each row execute function public.set_guest_profile_updated_at();

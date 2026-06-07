create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'superuser')),
  is_unlimited boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_idr integer not null,
  kind text not null check (kind in ('credit', 'debit')),
  reason text not null,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_name text not null default 'Project Vector',
  input_mode text not null check (input_mode in ('ready_trace', 'ai_redraw')),
  production_type text not null check (production_type in ('sticker', 'sablon')),
  status text not null default 'done',
  price_idr integer not null default 0,
  separation_film_count integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  ai_ledger_id uuid references public.credit_ledger(id),
  created_at timestamptz not null default now()
);

create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  marketplace text not null default 'shopee',
  order_ref text,
  amount_idr integer not null check (amount_idr > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  key text primary key,
  amount_idr integer not null check (amount_idr >= 0),
  active boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.pricing_rules (key, amount_idr, description)
values
  ('ready_trace', 1000, 'Gambar sudah rapi dan langsung trace'),
  ('ai_redraw', 2500, 'Gambar ulang otomatis'),
  ('separation_film', 1000, 'Setiap satu warna film separasi sablon')
on conflict (key) do update
set amount_idr = excluded.amount_idr,
    description = excluded.description,
    updated_at = now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
set search_path = public
language plpgsql
security definer
as $$
declare
  user_email text := lower(coalesce(new.email, ''));
begin
  insert into public.profiles (id, email, full_name, role, is_unlimited)
  values (
    new.id,
    user_email,
    new.raw_user_meta_data->>'full_name',
    case when user_email = 'jho.j80@gmail.com' then 'superuser' else 'user' end,
    user_email = 'jho.j80@gmail.com'
  )
  on conflict (id) do update
    set email = excluded.email,
        role = case when excluded.email = 'jho.j80@gmail.com' then 'superuser' else public.profiles.role end,
        is_unlimited = case when excluded.email = 'jho.j80@gmail.com' then true else public.profiles.is_unlimited end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_superuser(target_user_id uuid default auth.uid())
returns boolean
set search_path = public
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role = 'superuser'
      and is_active = true
      and deleted_at is null
  );
$$;

create or replace function public.credit_balance(target_user_id uuid)
returns integer
set search_path = public
language sql
security definer
stable
as $$
  select coalesce(sum(amount_idr), 0)::integer
  from public.credit_ledger
  where user_id = target_user_id;
$$;

alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.jobs enable row level security;
alter table public.manual_payments enable row level security;
alter table public.pricing_rules enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles for update
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

drop policy if exists "credit_select_own_or_admin" on public.credit_ledger;
create policy "credit_select_own_or_admin"
on public.credit_ledger for select
to authenticated
using (user_id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "jobs_select_own_or_admin" on public.jobs;
create policy "jobs_select_own_or_admin"
on public.jobs for select
to authenticated
using (user_id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "manual_payments_select_own_or_admin" on public.manual_payments;
create policy "manual_payments_select_own_or_admin"
on public.manual_payments for select
to authenticated
using (user_id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "manual_payments_insert_own" on public.manual_payments;
create policy "manual_payments_insert_own"
on public.manual_payments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "pricing_rules_read" on public.pricing_rules;
create policy "pricing_rules_read"
on public.pricing_rules for select
to authenticated
using (active = true or public.is_superuser(auth.uid()));

create index if not exists credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);
create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index if not exists manual_payments_user_created_idx on public.manual_payments (user_id, created_at desc);

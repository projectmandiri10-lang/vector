create extension if not exists pgcrypto;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'read', 'replied')),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists contact_messages_touch_updated_at on public.contact_messages;
create trigger contact_messages_touch_updated_at
before update on public.contact_messages
for each row execute function public.touch_updated_at();

create index if not exists contact_messages_status_created_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "contact_messages_admin_read" on public.contact_messages;
create policy "contact_messages_admin_read"
on public.contact_messages for select
to authenticated
using (public.is_superuser(auth.uid()));

drop policy if exists "contact_messages_admin_write" on public.contact_messages;
create policy "contact_messages_admin_write"
on public.contact_messages for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

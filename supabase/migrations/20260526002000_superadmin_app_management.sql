alter table public.manual_payments
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists rejected_reason text;

drop trigger if exists manual_payments_touch_updated_at on public.manual_payments;
create trigger manual_payments_touch_updated_at
before update on public.manual_payments
for each row execute function public.touch_updated_at();

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

insert into public.app_settings (key, value, is_public, description)
values
  ('shopee_payment', '{"url":"https://shopee.co.id/","note":"Pilih nominal credit di Shopee, bayar, lalu masukkan nomor pesanan di halaman billing.","contact":""}'::jsonb, true, 'Konfigurasi pembayaran manual Shopee'),
  ('app_status', '{"maintenance":false,"message":""}'::jsonb, true, 'Status aplikasi publik')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
on public.app_settings for select
to anon, authenticated
using (is_public = true or public.is_superuser(auth.uid()));

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write"
on public.app_settings for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

drop policy if exists "pricing_rules_admin_write" on public.pricing_rules;
create policy "pricing_rules_admin_write"
on public.pricing_rules for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

create index if not exists manual_payments_status_created_idx on public.manual_payments (status, created_at desc);

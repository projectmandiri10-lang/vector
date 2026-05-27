update public.app_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{note}',
    to_jsonb('Checkout nominal credit di Shopee, lalu kirim email akun Design Mudah melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.'::text),
    true
  ),
  updated_at = now()
where key = 'shopee_payment';

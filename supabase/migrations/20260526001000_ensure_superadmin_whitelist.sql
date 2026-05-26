insert into public.profiles (id, email, full_name, role, is_unlimited, is_active, deleted_at)
select
  id,
  lower(email),
  raw_user_meta_data->>'full_name',
  'superuser',
  true,
  true,
  null
from auth.users
where lower(email) = 'jho.j80@gmail.com'
on conflict (id) do update
set email = excluded.email,
    role = 'superuser',
    is_unlimited = true,
    is_active = true,
    deleted_at = null,
    updated_at = now();

update public.pricing_rules
set description = 'Gambar ulang otomatis'
where key = 'ai_redraw';

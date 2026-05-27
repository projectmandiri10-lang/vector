insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'example-jobs',
  'example-jobs',
  true,
  5242880,
  array['image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.app_settings (key, value, is_public, description)
values (
  'example_jobs',
  '{"sticker":null,"sablon":null}'::jsonb,
  true,
  'Contoh gambar aktif untuk sticker dan sablon'
)
on conflict (key) do update
set value = case
      when public.app_settings.value is null or public.app_settings.value = '{}'::jsonb then excluded.value
      else public.app_settings.value
    end,
    is_public = true,
    description = excluded.description,
    updated_at = now();

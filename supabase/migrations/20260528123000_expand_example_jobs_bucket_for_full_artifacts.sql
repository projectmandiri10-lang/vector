insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'example-jobs',
  'example-jobs',
  true,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'application/pdf',
    'application/zip',
    'application/json'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

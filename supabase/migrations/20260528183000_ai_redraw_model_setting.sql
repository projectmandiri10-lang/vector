insert into public.app_settings (key, value, is_public, description)
values (
  'ai_redraw_model',
  '{"mode":"quality","label":"Kualitas","model":"gemini-3.1-flash-image-preview","imageSize":"2K","estimatedUsdPerImage":0.101}'::jsonb,
  false,
  'Model dan ukuran output untuk gambar ulang AI'
)
on conflict (key) do nothing;

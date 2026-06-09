insert into public.app_settings (key, value, is_public, description)
values (
  'ai_redraw_model',
  jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'openrouter_qwen_image',
    'analysisModel', 'qwen/qwen3-vl-235b-a22b-instruct',
    'generationModel', 'qwen/qwen-image-2512',
    'generationQuality', 'high',
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.05,
    'note', 'Default OpenRouter Qwen untuk redraw halus yang nanti akan di-trace dan dipisah warna.'
  ),
  false,
  'Pipeline OpenRouter Qwen redraw: Qwen VL analyzer + Qwen Image model'
)
on conflict (key) do update
set
  value = excluded.value,
  is_public = false,
  description = excluded.description,
  updated_at = timezone('utc', now());

update public.pricing_rules
set
  amount_idr = 2500,
  description = 'Trace + Edge Refinement tanpa AI',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ready_trace';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ready_trace', 2500, 'Trace + Edge Refinement tanpa AI', true
where not exists (
  select 1 from public.pricing_rules where key = 'ready_trace'
);

update public.pricing_rules
set
  amount_idr = 5000,
  description = 'AI Redesign Premium image-to-image',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ai_redraw';

insert into public.app_settings (key, value, is_public, description)
values (
  'ai_redraw_model',
  jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'openrouter_gemini_image',
    'analysisModel', '',
    'generationModel', 'google/gemini-3.1-flash-image-preview',
    'safetyModel', 'nvidia/nemotron-3.5-content-safety:free',
    'generationQuality', 'high',
    'imageSize', '1K',
    'reasoningEffort', 'medium',
    'backgroundMode', 'transparent',
    'safetyEnabled', true,
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0,
    'note', 'Default OpenRouter Gemini 3.1 Flash Image Preview 1K + Nemotron safety. Ready Trace memakai edge refinement tanpa AI.'
  ),
  false,
  'Pipeline OpenRouter Gemini image redraw premium + Ready Trace edge refinement'
)
on conflict (key) do update
set
  value = excluded.value,
  is_public = false,
  description = excluded.description,
  updated_at = timezone('utc', now());

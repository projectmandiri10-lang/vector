update public.app_settings
set
  value = jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'openrouter_image',
    'analysisModel', '',
    'generationModel', 'black-forest-labs/flux.2-klein-4b',
    'fallbackModel', 'sourceful/riverflow-v2-fast',
    'safetyModel', 'nvidia/nemotron-3.5-content-safety:free',
    'promptProfile', 'generic_trace_clone',
    'generationQuality', 'high',
    'imageSize', '1K',
    'reasoningEffort', 'low',
    'backgroundMode', 'transparent',
    'safetyEnabled', true,
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.014,
    'note', 'Default OpenRouter FLUX.2 Klein 1K trace-clone + Nemotron safety. Fallback ke Riverflow V2 Fast bila primary gagal.'
  ),
  description = 'Pipeline OpenRouter FLUX trace-clone redraw premium + Ready Trace edge refinement',
  is_public = false,
  updated_at = now()
where key = 'ai_redraw_model';

insert into public.app_settings (key, value, is_public, description)
select
  'ai_redraw_model',
  jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'openrouter_image',
    'analysisModel', '',
    'generationModel', 'black-forest-labs/flux.2-klein-4b',
    'fallbackModel', 'sourceful/riverflow-v2-fast',
    'safetyModel', 'nvidia/nemotron-3.5-content-safety:free',
    'promptProfile', 'generic_trace_clone',
    'generationQuality', 'high',
    'imageSize', '1K',
    'reasoningEffort', 'low',
    'backgroundMode', 'transparent',
    'safetyEnabled', true,
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.014,
    'note', 'Default OpenRouter FLUX.2 Klein 1K trace-clone + Nemotron safety. Fallback ke Riverflow V2 Fast bila primary gagal.'
  ),
  false,
  'Pipeline OpenRouter FLUX trace-clone redraw premium + Ready Trace edge refinement'
where not exists (
  select 1 from public.app_settings where key = 'ai_redraw_model'
);

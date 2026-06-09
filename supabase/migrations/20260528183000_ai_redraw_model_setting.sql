insert into public.app_settings (key, value, is_public, description)
values (
  'ai_redraw_model',
  '{"mode":"quality","preset":"quality","label":"Kualitas","provider":"openrouter_riverflow_image","analysisModel":"","generationModel":"sourceful/riverflow-v2.5-pro:free","safetyModel":"nvidia/nemotron-3.5-content-safety:free","generationQuality":"high","imageSize":"2K","reasoningEffort":"medium","backgroundMode":"transparent","safetyEnabled":true,"aspectPolicy":"match_source","resolutionPolicy":"high","preprocess":"node_heuristic","persistPrompt":true,"retryOnLowConfidence":false,"estimatedUsdPerImage":0}'::jsonb,
  false,
  'Pipeline OpenRouter Riverflow redraw: Riverflow image model + Nemotron safety gate'
)
on conflict (key) do nothing;

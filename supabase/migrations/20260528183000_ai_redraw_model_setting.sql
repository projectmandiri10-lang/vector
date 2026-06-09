insert into public.app_settings (key, value, is_public, description)
values (
  'ai_redraw_model',
  '{"mode":"quality","preset":"quality","label":"Kualitas","provider":"openrouter_qwen_image","analysisModel":"qwen/qwen3-vl-235b-a22b-instruct","generationModel":"qwen/qwen-image-2512","generationQuality":"high","aspectPolicy":"match_source","resolutionPolicy":"high","preprocess":"node_heuristic","persistPrompt":true,"retryOnLowConfidence":false,"estimatedUsdPerImage":0.05}'::jsonb,
  false,
  'Pipeline OpenRouter Qwen redraw: Qwen VL analyzer + Qwen Image model'
)
on conflict (key) do nothing;

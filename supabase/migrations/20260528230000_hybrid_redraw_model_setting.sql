insert into public.app_settings (key, value, is_public, description)
values (
  'ai_redraw_model',
  jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'vertex_hybrid_imagen3',
    'analysisModel', 'gemini-3.1-flash-preview',
    'generationModel', 'imagen-3.0-generate-002',
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.045,
    'note', 'Default aman untuk redraw halus yang nanti akan di-trace dan dipisah warna.'
  ),
  false,
  'Pipeline hybrid redraw: Gemini director + Imagen 3 painter'
)
on conflict (key) do update
set
  value = case
    when coalesce(public.app_settings.value ->> 'provider', '') = 'vertex_hybrid_imagen3' then public.app_settings.value
    else jsonb_build_object(
      'mode',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') in ('budget', 'standard', 'quality', 'premium') then public.app_settings.value ->> 'mode'
        when coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 'budget'
        when coalesce(public.app_settings.value ->> 'model', '') = 'gemini-3-pro-image-preview' then 'premium'
        when coalesce(public.app_settings.value ->> 'imageSize', '') = '1K' then 'standard'
        else 'quality'
      end,
      'preset',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') in ('budget', 'standard', 'quality', 'premium') then public.app_settings.value ->> 'mode'
        when coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 'budget'
        when coalesce(public.app_settings.value ->> 'model', '') = 'gemini-3-pro-image-preview' then 'premium'
        when coalesce(public.app_settings.value ->> 'imageSize', '') = '1K' then 'standard'
        else 'quality'
      end,
      'label',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') = 'budget' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 'Hemat'
        when coalesce(public.app_settings.value ->> 'mode', '') = 'standard' or coalesce(public.app_settings.value ->> 'imageSize', '') = '1K' then 'Standar'
        when coalesce(public.app_settings.value ->> 'mode', '') = 'premium' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-3-pro-image-preview' then 'Premium'
        else 'Kualitas'
      end,
      'provider', 'vertex_hybrid_imagen3',
      'analysisModel', 'gemini-3.1-flash-preview',
      'generationModel',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') = 'budget' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 'imagen-3.0-fast-generate-001'
        else 'imagen-3.0-generate-002'
      end,
      'aspectPolicy', 'match_source',
      'resolutionPolicy',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') = 'budget' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 'economy'
        when coalesce(public.app_settings.value ->> 'mode', '') = 'standard' or coalesce(public.app_settings.value ->> 'imageSize', '') = '1K' then 'standard'
        else 'high'
      end,
      'preprocess', 'node_heuristic',
      'persistPrompt', true,
      'retryOnLowConfidence',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') = 'premium' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-3-pro-image-preview' then true
        else false
      end,
      'estimatedUsdPerImage',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') = 'budget' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 0.022
        when coalesce(public.app_settings.value ->> 'mode', '') = 'standard' or coalesce(public.app_settings.value ->> 'imageSize', '') = '1K' then 0.041
        when coalesce(public.app_settings.value ->> 'mode', '') = 'premium' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-3-pro-image-preview' then 0.05
        else 0.045
      end,
      'note',
      case
        when coalesce(public.app_settings.value ->> 'mode', '') = 'budget' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-2.5-flash-image' then 'Gemini menganalisis niat desain, lalu Imagen 3 Fast menggambar ulang dengan biaya paling hemat.'
        when coalesce(public.app_settings.value ->> 'mode', '') = 'standard' or coalesce(public.app_settings.value ->> 'imageSize', '') = '1K' then 'Keseimbangan biaya dan kualitas untuk mayoritas logo, sticker, dan sablon.'
        when coalesce(public.app_settings.value ->> 'mode', '') = 'premium' or coalesce(public.app_settings.value ->> 'model', '') = 'gemini-3-pro-image-preview' then 'Menambah satu retry otomatis saat Gemini menilai pembacaan teks atau bentuk masih kurang yakin.'
        else 'Default aman untuk redraw halus yang nanti akan di-trace dan dipisah warna.'
      end
    )
  end,
  is_public = false,
  description = 'Pipeline hybrid redraw: Gemini director + Imagen 3 painter',
  updated_at = timezone('utc', now());

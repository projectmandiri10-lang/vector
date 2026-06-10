update public.pricing_rules
set
  amount_idr = 5000,
  description = 'AI Redesign Premium image-to-image',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ai_redraw';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ai_redraw', 5000, 'AI Redesign Premium image-to-image', true
where not exists (
  select 1 from public.pricing_rules where key = 'ai_redraw'
);

update public.app_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{note}',
    to_jsonb('Default eksperimen Riverflow direct image-to-image dengan safety gate Nemotron. Ready Trace memakai edge refinement tanpa AI.'::text),
    true
  ),
  description = 'Pipeline OpenRouter Riverflow redraw premium + Ready Trace edge refinement',
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model';

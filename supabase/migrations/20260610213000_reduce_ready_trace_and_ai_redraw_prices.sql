update public.pricing_rules
set
  amount_idr = 2000,
  description = 'Vector Siap Proses SVG tanpa AI',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ready_trace';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ready_trace', 2000, 'Vector Siap Proses SVG tanpa AI', true
where not exists (
  select 1
  from public.pricing_rules
  where key = 'ready_trace'
);

update public.pricing_rules
set
  amount_idr = 3000,
  description = 'AI Redesign Premium image-to-image',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ai_redraw';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ai_redraw', 3000, 'AI Redesign Premium image-to-image', true
where not exists (
  select 1
  from public.pricing_rules
  where key = 'ai_redraw'
);

update public.pricing_rules
set
  amount_idr = 0,
  description = 'Download film separasi gratis',
  active = true,
  updated_at = timezone('utc', now())
where key = 'separation_film';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'separation_film', 0, 'Download film separasi gratis', true
where not exists (
  select 1
  from public.pricing_rules
  where key = 'separation_film'
);

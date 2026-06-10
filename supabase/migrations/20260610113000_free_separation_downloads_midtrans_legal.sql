insert into public.pricing_rules (key, amount_idr, description, active)
values ('separation_film', 0, 'Download film separasi sablon gratis setelah proses gambar', true)
on conflict (key) do update
set amount_idr = excluded.amount_idr,
    description = excluded.description,
    active = true,
    updated_at = now();

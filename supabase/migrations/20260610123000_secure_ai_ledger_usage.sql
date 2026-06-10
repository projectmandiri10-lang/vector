create unique index if not exists jobs_ai_ledger_id_unique_idx
on public.jobs (ai_ledger_id)
where ai_ledger_id is not null;

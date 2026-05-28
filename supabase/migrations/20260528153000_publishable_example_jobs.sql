alter table public.jobs
  add column if not exists is_example_public boolean not null default false,
  add column if not exists example_published_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists jobs_example_public_created_idx
  on public.jobs (is_example_public, created_at desc)
  where deleted_at is null;

create index if not exists jobs_deleted_created_idx
  on public.jobs (deleted_at, created_at desc);

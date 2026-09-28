-- Build 5.7.2: scheduler heartbeat hardening
-- Heartbeat is the authoritative freshness signal for scheduler diagnostics.

alter table if exists public.trademind_scheduler_runs
  add column if not exists heartbeat_at timestamptz;

update public.trademind_scheduler_runs
set heartbeat_at = coalesce(heartbeat_at, started_at, created_at)
where heartbeat_at is null;

create index if not exists idx_trademind_scheduler_runs_heartbeat_at
  on public.trademind_scheduler_runs (heartbeat_at desc);

notify pgrst, 'reload schema';

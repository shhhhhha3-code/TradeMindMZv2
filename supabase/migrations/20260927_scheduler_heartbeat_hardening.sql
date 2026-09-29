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

-- Build 5.26: recover stale scheduler runs so one abandoned QUEUED/RUNNING
-- record cannot block the recurring 7-minute scheduler forever.
update public.trademind_scheduler_runs
set
  status = 'FAILED',
  finished_at = coalesce(finished_at, now()),
  current_stage = coalesce(current_stage, 'STALE_RECOVERY'),
  error = coalesce(error, 'Scheduler run was automatically marked stale after exceeding the recovery window.')
where status in ('QUEUED', 'RUNNING')
  and coalesce(heartbeat_at, started_at, created_at) < now() - interval '15 minutes';

notify pgrst, 'reload schema';

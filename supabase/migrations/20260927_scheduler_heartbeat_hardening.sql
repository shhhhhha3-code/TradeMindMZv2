-- TradeMindMZ V2
-- Build 5.6 scheduler heartbeat hardening.
-- Heartbeat is separate from completion so long-running/queued scheduler work
-- remains observable without being mistaken for a stale completed run.

alter table public.trademind_scheduler_runs
  add column if not exists heartbeat_at timestamptz;

update public.trademind_scheduler_runs
   set heartbeat_at = coalesce(heartbeat_at, started_at, created_at)
 where heartbeat_at is null;

create index if not exists idx_trademind_scheduler_runs_heartbeat
  on public.trademind_scheduler_runs(heartbeat_at desc);

notify pgrst, 'reload schema';

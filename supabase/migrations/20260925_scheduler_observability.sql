-- TradeMindMZ V2
-- Scheduler observability: persist phase timings without changing trading logic.

alter table public.trademind_scheduler_runs
  add column if not exists duration_ms integer,
  add column if not exists perp_duration_ms integer,
  add column if not exists spot_duration_ms integer,
  add column if not exists monitoring_duration_ms integer,
  add column if not exists current_stage text;

create index if not exists idx_trademind_scheduler_runs_status_created
  on public.trademind_scheduler_runs(status, created_at desc);

notify pgrst, 'reload schema';

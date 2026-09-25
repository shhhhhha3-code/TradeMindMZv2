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


-- Neural activity feed observability.
alter table public.trademind_scheduler_runs
  add column if not exists perp_scanned integer,
  add column if not exists perp_candidates integer,
  add column if not exists perp_provider text,
  add column if not exists perp_decision text,
  add column if not exists perp_push_status text,
  add column if not exists spot_scanned integer,
  add column if not exists spot_candidates integer,
  add column if not exists spot_provider text,
  add column if not exists spot_decision text,
  add column if not exists spot_push_status text;

notify pgrst, 'reload schema';

alter table public.ai_copilot_history
  add column if not exists decision_id text,
  add column if not exists outcome_status text default 'PENDING',
  add column if not exists outcome_result text,
  add column if not exists outcome_return_pct numeric,
  add column if not exists outcome_reason text,
  add column if not exists paper_trade_id text,
  add column if not exists outcome_at timestamptz,
  add column if not exists holding_minutes numeric;

create index if not exists idx_ai_copilot_history_outcome_status
  on public.ai_copilot_history(outcome_status);

create index if not exists idx_ai_copilot_history_decision_id
  on public.ai_copilot_history(decision_id);

create or replace view public.ai_copilot_decision_memory_stats as
select
  count(*) as total_decisions,
  count(*) filter (where outcome_status = 'PENDING') as pending_decisions,
  count(*) filter (where outcome_status = 'WIN') as wins,
  count(*) filter (where outcome_status = 'LOSS') as losses,
  count(*) filter (where outcome_status = 'FLAT') as flats,
  count(*) filter (where outcome_status in ('WIN','LOSS','FLAT')) as resolved_decisions,
  coalesce(avg(outcome_return_pct) filter (where outcome_status in ('WIN','LOSS','FLAT')), 0) as average_return_pct,
  coalesce(avg(holding_minutes) filter (where outcome_status in ('WIN','LOSS','FLAT')), 0) as average_holding_minutes
from public.ai_copilot_history;

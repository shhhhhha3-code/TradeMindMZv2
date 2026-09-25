alter table public.ai_copilot_history
  add column if not exists direction text,
  add column if not exists factor_pass_count integer,
  add column if not exists strategy_signature text;

create index if not exists idx_ai_copilot_history_strategy_signature
  on public.ai_copilot_history(strategy_signature);

create or replace view public.ai_copilot_strategy_stats as
select
  coalesce(regime, 'UNKNOWN') as regime,
  coalesce(risk, 'UNKNOWN') as risk,
  count(*) as sample_size,
  count(*) filter (where outcome_status = 'WIN') as wins,
  count(*) filter (where outcome_status = 'LOSS') as losses,
  coalesce(avg(outcome_return_pct), 0) as average_return_pct
from public.ai_copilot_history
where outcome_status in ('WIN','LOSS','FLAT')
group by coalesce(regime, 'UNKNOWN'), coalesce(risk, 'UNKNOWN');

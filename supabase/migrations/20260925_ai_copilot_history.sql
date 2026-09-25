create table if not exists public.ai_copilot_history (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  action text not null,
  confidence numeric,
  risk text,
  regime text,
  engine_score numeric,
  engine_reasons jsonb not null default '[]'::jsonb,
  factors jsonb not null default '[]'::jsonb,
  position_review jsonb,
  ai_result jsonb,
  candidates jsonb not null default '[]'::jsonb,
  source text not null default 'TRADEMINDMZ_COPILOT_V2',
  created_at timestamptz not null default now()
);

create index if not exists ai_copilot_history_created_at_idx
  on public.ai_copilot_history(created_at desc);

create index if not exists ai_copilot_history_symbol_idx
  on public.ai_copilot_history(symbol);

create index if not exists ai_copilot_history_action_idx
  on public.ai_copilot_history(action);

alter table public.ai_copilot_history enable row level security;

create or replace view public.ai_copilot_learning_stats as
select
  count(*)::bigint as total_decisions,
  round(avg(confidence)::numeric, 2) as average_confidence,
  count(*) filter (where action = 'TRADE')::bigint as trade_count,
  count(*) filter (where action = 'WATCH')::bigint as watch_count,
  count(*) filter (where action = 'NO_TRADE')::bigint as no_trade_count,
  count(*) filter (where risk = 'HIGH')::bigint as high_risk_count
from public.ai_copilot_history;

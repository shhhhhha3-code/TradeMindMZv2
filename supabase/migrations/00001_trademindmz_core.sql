-- =================================================
-- TradeMindMZ V2 — Core database
-- =================================================
-- No demo trading.
-- No live order execution.
-- AI calls are handled separately.
-- =================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------
-- MARKET CANDLES
-- Historical and current market data
-- -------------------------------------------------

create table if not exists public.market_candles (
  id uuid primary key default gen_random_uuid(),

  symbol text not null,
  timeframe text not null default '1h',

  candle_time timestamptz not null,

  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric,

  rsi numeric,
  macd numeric,
  ema20 numeric,
  ema50 numeric,
  ema200 numeric,

  created_at timestamptz not null default now(),

  unique(symbol, timeframe, candle_time)
);

create index if not exists idx_market_candles_symbol_time
  on public.market_candles(symbol, timeframe, candle_time desc);


-- -------------------------------------------------
-- AI SIGNALS
-- Every AI recommendation is stored.
-- -------------------------------------------------

create table if not exists public.ai_signals (
  id uuid primary key default gen_random_uuid(),

  symbol text not null,

  signal text not null
    check (signal in ('BUY', 'SELL', 'HOLD', 'NEUTRAL')),

  score numeric,
  confidence numeric,

  entry numeric,
  stop_loss numeric,
  take_profit numeric,
  risk_reward numeric,

  reasoning text,

  provider text,
  model text,

  historical_learning_used boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_ai_signals_symbol_created
  on public.ai_signals(symbol, created_at desc);


-- -------------------------------------------------
-- SIGNAL OUTCOMES
-- Used to measure how previous recommendations
-- actually performed.
-- -------------------------------------------------

create table if not exists public.signal_outcomes (
  id uuid primary key default gen_random_uuid(),

  signal_id uuid not null
    references public.ai_signals(id)
    on delete cascade,

  evaluated_at timestamptz not null default now(),

  future_price numeric,

  result text
    check (result in ('WIN', 'LOSS', 'OPEN', 'INVALID')),

  return_percent numeric,

  risk_reward numeric,

  holding_period_minutes integer,

  created_at timestamptz not null default now()
);

create index if not exists idx_signal_outcomes_signal
  on public.signal_outcomes(signal_id);

create index if not exists idx_signal_outcomes_result
  on public.signal_outcomes(result);


-- -------------------------------------------------
-- USER PIONEX POSITIONS
--
-- This is NOT a trading table.
-- It records positions the USER tells TradeMindMZ
-- they have opened in Pionex.
-- -------------------------------------------------

create table if not exists public.pionex_positions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  symbol text not null,

  side text not null
    check (side in ('LONG', 'SHORT')),

  entry_price numeric not null,

  quantity numeric,

  stop_loss numeric,
  take_profit numeric,

  status text not null default 'OPEN'
    check (status in ('OPEN', 'CLOSED', 'STOPPED')),

  opened_at timestamptz not null default now(),
  closed_at timestamptz,

  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_pionex_positions_user
  on public.pionex_positions(user_id, created_at desc);

create index if not exists idx_pionex_positions_open
  on public.pionex_positions(user_id, status);


-- -------------------------------------------------
-- AI USAGE
--
-- Lets the user see/control AI cost.
-- -------------------------------------------------

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),

  provider text not null,

  model text,

  operation text not null,

  tokens_input integer default 0,
  tokens_output integer default 0,

  estimated_cost numeric default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_created
  on public.ai_usage(created_at desc);


-- -------------------------------------------------
-- ROW LEVEL SECURITY
-- -------------------------------------------------

alter table public.market_candles enable row level security;
alter table public.ai_signals enable row level security;
alter table public.signal_outcomes enable row level security;
alter table public.pionex_positions enable row level security;
alter table public.ai_usage enable row level security;


-- -------------------------------------------------
-- PUBLIC MARKET DATA
-- -------------------------------------------------

create policy "Authenticated users can read market candles"
on public.market_candles
for select
to authenticated
using (true);


-- -------------------------------------------------
-- AI SIGNALS
-- -------------------------------------------------

create policy "Authenticated users can read AI signals"
on public.ai_signals
for select
to authenticated
using (true);


-- -------------------------------------------------
-- SIGNAL OUTCOMES
-- -------------------------------------------------

create policy "Authenticated users can read signal outcomes"
on public.signal_outcomes
for select
to authenticated
using (true);


-- -------------------------------------------------
-- PIONEX POSITIONS
-- Users can only access their own positions.
-- -------------------------------------------------

create policy "Users can read own Pionex positions"
on public.pionex_positions
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own Pionex positions"
on public.pionex_positions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own Pionex positions"
on public.pionex_positions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- -------------------------------------------------
-- AI USAGE
-- Users may read usage.
-- Inserts will later be performed server-side.
-- -------------------------------------------------

create policy "Authenticated users can read AI usage"
on public.ai_usage
for select
to authenticated
using (true);


-- -------------------------------------------------
-- GRANTS
-- -------------------------------------------------

grant select on public.market_candles to authenticated;
grant select on public.ai_signals to authenticated;
grant select on public.signal_outcomes to authenticated;

grant select, insert, update
on public.pionex_positions
to authenticated;

grant select on public.ai_usage to authenticated;


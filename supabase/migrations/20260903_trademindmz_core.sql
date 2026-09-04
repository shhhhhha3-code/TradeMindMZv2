-- ============================================================
-- TradeMindMZ V2 - Core Database
-- ============================================================

-- ------------------------------------------------------------
-- 1. USER PROFILES
-- ------------------------------------------------------------

create table if not exists public.user_profiles (
  id uuid primary key,
  username text unique not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. USER SETTINGS
-- ------------------------------------------------------------

create table if not exists public.user_settings (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,

  ai_enabled boolean not null default true,
  openai_enabled boolean not null default true,
  groq_enabled boolean not null default true,
  historical_learning_enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TRACKED POSITIONS
-- Manual Pionex purchases only.
-- TradeMindMZ NEVER executes Pionex orders.
-- ------------------------------------------------------------

create table if not exists public.tracked_positions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.user_profiles(id) on delete cascade,

  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),

  entry_price numeric(30,12) not null,
  quantity numeric(30,12) not null,

  stop_loss numeric(30,12),
  take_profit numeric(30,12),

  source text not null default 'MANUAL_PIONEX'
    check (source in ('MANUAL_PIONEX')),

  status text not null default 'LIVE'
    check (status in ('LIVE', 'CLOSED', 'CANCELLED')),

  current_price numeric(30,12),
  unrealized_pnl numeric(30,12),
  unrealized_pnl_percent numeric(12,6),

  ai_recommendation text,
  ai_confidence numeric(6,3),
  ai_reasoning text,

  opened_at timestamptz not null default now(),
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. AI SIGNALS
-- ------------------------------------------------------------

create table if not exists public.ai_signals (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.user_profiles(id) on delete cascade,

  symbol text not null,

  signal text not null
    check (signal in ('BUY', 'SELL', 'HOLD', 'WATCH')),

  confidence numeric(6,3),

  price numeric(30,12),

  reasoning text,

  source text,
  provider text,

  timeframe text,

  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. AI SIGNAL HISTORY
-- ------------------------------------------------------------

create table if not exists public.ai_signal_history (
  id uuid primary key default gen_random_uuid(),

  signal_id uuid references public.ai_signals(id) on delete cascade,

  user_id uuid references public.user_profiles(id) on delete cascade,

  symbol text not null,

  signal text not null,

  confidence numeric(6,3),

  outcome text,
  outcome_price numeric(30,12),
  outcome_pnl numeric(30,12),

  evaluated_at timestamptz,

  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. MARKET SNAPSHOTS
-- Read-only market information.
-- ------------------------------------------------------------

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),

  symbol text not null,

  price numeric(30,12),
  volume_24h numeric(30,12),
  change_24h numeric(12,6),

  source text not null default 'BINANCE',

  timeframe text,

  captured_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. POSITION AI ANALYSIS HISTORY
-- ------------------------------------------------------------

create table if not exists public.position_ai_analysis (
  id uuid primary key default gen_random_uuid(),

  position_id uuid references public.tracked_positions(id) on delete cascade,

  user_id uuid references public.user_profiles(id) on delete cascade,

  recommendation text,
  confidence numeric(6,3),

  reasoning text,

  provider text,

  market_price numeric(30,12),

  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. PIONEX READ-ONLY CONNECTION
-- API credentials are NOT stored here.
-- Only connection metadata.
-- ------------------------------------------------------------

create table if not exists public.pionex_connections (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.user_profiles(id) on delete cascade,

  connection_name text default 'Pionex',

  enabled boolean not null default false,
  read_only boolean not null default true,

  last_sync_at timestamptz,

  status text default 'DISCONNECTED',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pionex_read_only_required
    check (read_only = true)
);

-- ------------------------------------------------------------
-- 9. HISTORICAL LEARNING
-- ------------------------------------------------------------

create table if not exists public.learning_records (
  id uuid primary key default gen_random_uuid(),

  symbol text not null,

  timeframe text,

  strategy text,

  signal text,

  entry_price numeric(30,12),
  exit_price numeric(30,12),

  pnl numeric(30,12),
  pnl_percent numeric(12,6),

  result text,

  source text,

  recorded_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

create index if not exists idx_tracked_positions_user
  on public.tracked_positions(user_id);

create index if not exists idx_tracked_positions_status
  on public.tracked_positions(status);

create index if not exists idx_tracked_positions_symbol
  on public.tracked_positions(symbol);

create index if not exists idx_ai_signals_user
  on public.ai_signals(user_id);

create index if not exists idx_ai_signals_symbol
  on public.ai_signals(symbol);

create index if not exists idx_ai_signals_created
  on public.ai_signals(created_at desc);

create index if not exists idx_market_snapshots_symbol
  on public.market_snapshots(symbol);

create index if not exists idx_market_snapshots_captured
  on public.market_snapshots(captured_at desc);

create index if not exists idx_learning_symbol
  on public.learning_records(symbol);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.tracked_positions enable row level security;
alter table public.ai_signals enable row level security;
alter table public.ai_signal_history enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.position_ai_analysis enable row level security;
alter table public.pionex_connections enable row level security;
alter table public.learning_records enable row level security;

-- ------------------------------------------------------------
-- SERVICE ROLE ACCESS
--
-- Backend uses SUPABASE_SECRET_KEY.
-- This key bypasses RLS.
--
-- Browser/user policies will be added when authentication
-- is wired into the application.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- SCHEMA CACHE REFRESH
-- ------------------------------------------------------------

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICATION
-- ------------------------------------------------------------

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'user_profiles',
    'user_settings',
    'tracked_positions',
    'ai_signals',
    'ai_signal_history',
    'market_snapshots',
    'position_ai_analysis',
    'pionex_connections',
    'learning_records',
    'trademindmz_health'
  )
order by table_name;
-- TradeMindMZ V2
-- Server-side position monitoring + persistent trade journal.
-- Read-only: this migration does not create or enable order execution.

create table if not exists public.trade_journal (
  position_key text primary key,
  symbol text not null,
  side text not null check (side in ('LONG','SHORT')),
  entry_price numeric(30,12),
  quantity numeric(30,12),
  stop_loss numeric(30,12),
  take_profit numeric(30,12),
  ai_confidence_at_entry numeric(6,3),
  ai_hold_time_min_minutes integer,
  ai_hold_time_max_minutes integer,
  ai_hold_time_reason text,
  opened_at timestamptz not null default now(),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  last_price numeric(30,12),
  last_pnl numeric(30,12),
  last_pnl_percent numeric(12,6),
  exit_price numeric(30,12),
  realized_pnl numeric(30,12),
  closed_at timestamptz,
  close_reason text,
  source text not null default 'PIONEX_READ_ONLY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trade_journal_status_updated
  on public.trade_journal(status, updated_at desc);

create index if not exists idx_trade_journal_symbol
  on public.trade_journal(symbol, side, updated_at desc);

alter table public.trade_journal enable row level security;
revoke all on public.trade_journal from anon, authenticated, public;

-- The Edge Function uses the Supabase secret/service key, so the table
-- remains inaccessible directly from the mobile client.
notify pgrst, 'reload schema';

-- TradeMindMZ V2
-- Position AI history metadata
--
-- Adds the market identity needed by Signal History.
-- No trading logic is changed.

alter table public.position_ai_analysis
  add column if not exists symbol text;

alter table public.position_ai_analysis
  add column if not exists direction text;

alter table public.position_ai_analysis
  add column if not exists entry_price numeric(30,12);

alter table public.position_ai_analysis
  add column if not exists source text;

create index if not exists
  idx_position_ai_analysis_symbol
on public.position_ai_analysis(symbol);

create index if not exists
  idx_position_ai_analysis_created_at
on public.position_ai_analysis(created_at desc);

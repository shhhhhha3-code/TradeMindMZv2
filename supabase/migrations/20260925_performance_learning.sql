-- TradeMindMZ performance feedback index
-- Keeps 24h / 7d / 30d learning queries fast without changing trading behavior.

create index if not exists idx_trade_journal_closed_at
  on public.trade_journal(closed_at desc)
  where status = 'CLOSED';

notify pgrst, 'reload schema';

-- TradeMindMZ data-source linkage
alter table if exists public.football_matches add column if not exists external_id text;
create unique index if not exists football_matches_external_id_uidx on public.football_matches(external_id) where external_id is not null;
alter table if exists public.football_matches add column if not exists raw jsonb;
alter table if exists public.football_odds add column if not exists external_event_id text;
create unique index if not exists football_odds_external_uidx on public.football_odds(external_event_id,bookmaker,market,selection) where external_event_id is not null;
create index if not exists football_matches_kickoff_idx on public.football_matches(kickoff_at);
create index if not exists football_odds_match_idx on public.football_odds(match_id,captured_at desc);

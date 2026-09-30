-- Football AI schema on the existing TradeMindMZ Supabase project.
create extension if not exists "pgcrypto";

create table if not exists public.football_matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  league text not null,
  season text,
  kickoff_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  status text not null default 'SCHEDULED',
  home_score integer,
  away_score integer,
  venue text,
  source text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_football_matches_kickoff on public.football_matches(kickoff_at);
create index if not exists idx_football_matches_league_kickoff on public.football_matches(league,kickoff_at);

create table if not exists public.football_odds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.football_matches(id) on delete cascade,
  bookmaker text,
  market text not null,
  selection text not null,
  odds numeric(10,3) not null,
  captured_at timestamptz not null default now(),
  raw jsonb
);
create index if not exists idx_football_odds_match on public.football_odds(match_id,captured_at desc);

create table if not exists public.football_team_stats (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  league text,
  season text,
  matches_played integer default 0,
  wins integer default 0,
  draws integer default 0,
  losses integer default 0,
  goals_for numeric default 0,
  goals_against numeric default 0,
  xg_for numeric,
  xg_against numeric,
  form jsonb,
  source text,
  updated_at timestamptz not null default now(),
  unique(team_name,league,season)
);

create table if not exists public.football_ai_predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.football_matches(id) on delete cascade,
  prediction text not null,
  confidence numeric(6,3),
  implied_probability numeric(6,3),
  odds numeric(10,3),
  value_percent numeric(8,3),
  model_score numeric(8,3),
  reasoning jsonb,
  provider text,
  model text,
  status text not null default 'OPEN' check (status in ('OPEN','WON','LOST','VOID')),
  evaluated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_football_predictions_match on public.football_ai_predictions(match_id,created_at desc);
create index if not exists idx_football_predictions_status on public.football_ai_predictions(status,created_at desc);

create table if not exists public.football_ai_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'MATCH_SCAN',
  matches_scanned integer default 0,
  predictions_created integer default 0,
  provider text,
  status text not null default 'SUCCESS',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_football_ai_runs_started on public.football_ai_runs(started_at desc);

alter table public.football_matches enable row level security;
alter table public.football_odds enable row level security;
alter table public.football_team_stats enable row level security;
alter table public.football_ai_predictions enable row level security;
alter table public.football_ai_runs enable row level security;

drop policy if exists "Football matches readable" on public.football_matches;
create policy "Football matches readable" on public.football_matches for select to anon, authenticated using (true);
drop policy if exists "Football odds readable" on public.football_odds;
create policy "Football odds readable" on public.football_odds for select to anon, authenticated using (true);
drop policy if exists "Football team stats readable" on public.football_team_stats;
create policy "Football team stats readable" on public.football_team_stats for select to anon, authenticated using (true);
drop policy if exists "Football predictions readable" on public.football_ai_predictions;
create policy "Football predictions readable" on public.football_ai_predictions for select to anon, authenticated using (true);
drop policy if exists "Football runs readable" on public.football_ai_runs;
create policy "Football runs readable" on public.football_ai_runs for select to anon, authenticated using (true);

grant select on public.football_matches, public.football_odds, public.football_team_stats, public.football_ai_predictions, public.football_ai_runs to anon, authenticated;
notify pgrst, 'reload schema';

-- Football AI learning, feature engineering and evaluation layer.
create table if not exists public.football_ai_features (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.football_matches(id) on delete cascade,
  feature_version text not null default 'feature-v1',
  feature_vector jsonb not null,
  data_quality numeric(6,3),
  created_at timestamptz not null default now(),
  unique(match_id, feature_version)
);
create index if not exists idx_football_ai_features_match on public.football_ai_features(match_id,created_at desc);

create table if not exists public.football_ai_model_weights (
  model_name text primary key,
  model_version text not null,
  weights jsonb not null,
  bias jsonb not null,
  learning_rate numeric(12,8) not null default 0.02,
  training_samples integer not null default 0,
  log_loss numeric(12,6),
  brier_score numeric(12,6),
  accuracy numeric(8,5),
  roi numeric(12,6),
  updated_at timestamptz not null default now()
);

create table if not exists public.football_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.football_ai_predictions(id) on delete cascade,
  match_id uuid not null references public.football_matches(id) on delete cascade,
  actual_result text not null,
  predicted_result text not null,
  correct boolean not null,
  stake numeric(12,4) not null default 1,
  pnl numeric(12,6),
  brier_score numeric(12,6),
  log_loss numeric(12,6),
  evaluated_at timestamptz not null default now(),
  unique(prediction_id)
);
create index if not exists idx_football_ai_evaluations_date on public.football_ai_evaluations(evaluated_at desc);

alter table public.football_ai_predictions
  add column if not exists feature_vector jsonb,
  add column if not exists feature_version text default 'feature-v1',
  add column if not exists model_version text,
  add column if not exists selected_outcome text,
  add column if not exists settled_result text,
  add column if not exists pnl numeric(12,6),
  add column if not exists llm_reasoning text;

alter table public.football_matches
  add column if not exists home_team_id text,
  add column if not exists away_team_id text,
  add column if not exists home_xg numeric,
  add column if not exists away_xg numeric,
  add column if not exists home_injuries jsonb,
  add column if not exists away_injuries jsonb;

alter table public.football_ai_features enable row level security;
alter table public.football_ai_model_weights enable row level security;
alter table public.football_ai_evaluations enable row level security;

drop policy if exists "Football features readable" on public.football_ai_features;
create policy "Football features readable" on public.football_ai_features for select to anon, authenticated using (true);
drop policy if exists "Football model weights readable" on public.football_ai_model_weights;
create policy "Football model weights readable" on public.football_ai_model_weights for select to anon, authenticated using (true);
drop policy if exists "Football evaluations readable" on public.football_ai_evaluations;
create policy "Football evaluations readable" on public.football_ai_evaluations for select to anon, authenticated using (true);

grant select on public.football_ai_features, public.football_ai_model_weights, public.football_ai_evaluations to anon, authenticated;
notify pgrst, 'reload schema';

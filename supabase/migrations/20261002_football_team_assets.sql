-- Cached team assets resolved from API-Football.
-- Team logos are reference data and should not be requested on every page render.
create table if not exists public.football_team_assets (
  id uuid primary key default gen_random_uuid(),
  team_key text not null unique,
  team_name text not null,
  country text,
  provider_team_id text,
  logo_url text,
  source text not null default 'API-Football',
  updated_at timestamptz not null default now()
);

create index if not exists idx_football_team_assets_name on public.football_team_assets(team_name);
create index if not exists idx_football_team_assets_country on public.football_team_assets(country);

alter table public.football_team_assets enable row level security;
drop policy if exists "Football team assets readable" on public.football_team_assets;
create policy "Football team assets readable" on public.football_team_assets for select to anon, authenticated using (true);
grant select on public.football_team_assets to anon, authenticated;
notify pgrst, 'reload schema';

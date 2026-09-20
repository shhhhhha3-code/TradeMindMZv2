-- TradeMindMZ V2
-- Persistent market/AI snapshots + server-side 7 minute scheduler.
-- The Android app is a viewer/client; the backend remains the analysis engine.

create extension if not exists "pgcrypto";
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.market_ai_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'SUCCESS'
    check (status in ('SUCCESS', 'ERROR')),
  market_type text not null default 'PERP',
  contract_type text not null default 'USDT-M PERPETUAL',
  interval text not null default '15M',
  leverage numeric not null default 2,
  scanned integer not null default 0,
  candidates jsonb not null default '[]'::jsonb,
  ai_decision jsonb,
  final_decision text not null default 'NO_TRADE',
  provider text,
  next_analysis_at timestamptz,
  payload jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_market_ai_snapshots_latest
  on public.market_ai_snapshots(market_type, interval, leverage, created_at desc);

alter table public.market_ai_snapshots enable row level security;

revoke all on public.market_ai_snapshots from anon, authenticated, public;

create table if not exists public.trademind_scheduler_secrets (
  id boolean primary key default true check (id = true),
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

insert into public.trademind_scheduler_secrets (id)
values (true)
on conflict (id) do nothing;

alter table public.trademind_scheduler_secrets enable row level security;
revoke all on public.trademind_scheduler_secrets from anon, authenticated, public;

create or replace function public.trademind_run_ai_scheduler()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  scheduler_secret text;
  request_id bigint;
begin
  select secret
    into scheduler_secret
    from public.trademind_scheduler_secrets
   where id = true;

  if scheduler_secret is null then
    raise exception 'TradeMindMZ scheduler secret is not configured';
  end if;

  select net.http_post(
    url := 'https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/trademind-api/api/ai/scheduled-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trademind-scheduler', scheduler_secret
    ),
    body := jsonb_build_object(
      'source', 'supabase-cron',
      'scheduledAt', now()
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$$;

revoke execute on function public.trademind_run_ai_scheduler() from public, anon, authenticated;

-- Recreate the job idempotently when the migration is replayed locally.
do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'trademind-ai-every-7-minutes';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'trademind-ai-every-7-minutes',
    '*/7 * * * *',
    $$select public.trademind_run_ai_scheduler();$$
  );
end;
$$;

-- Keep enough history for diagnostics/learning without growing indefinitely.
do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'trademind-ai-snapshot-cleanup';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'trademind-ai-snapshot-cleanup',
    '17 3 * * *',
    $$delete from public.market_ai_snapshots where created_at < now() - interval '14 days';$$
  );
end;
$$;

notify pgrst, 'reload schema';

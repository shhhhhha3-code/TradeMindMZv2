-- TradeMindMZ V2
-- Scheduler hardening: prevent overlapping runs, make cron triggers observable,
-- and keep the persisted leverage default aligned with the live PERP engine.

alter table public.market_ai_snapshots
  alter column leverage set default 3;

create or replace function public.trademind_run_ai_scheduler()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  scheduler_secret text;
  request_id bigint;
  scheduler_run_id bigint;
  latest_status text;
  latest_started_at timestamptz;
begin
  select secret
    into scheduler_secret
    from public.trademind_scheduler_secrets
   where id = true;

  if scheduler_secret is null then
    raise exception 'TradeMindMZ scheduler secret is not configured';
  end if;

  -- A normal run should finish well inside the 7 minute cadence.
  -- Never start a second full Pionex + AI cycle while the previous one
  -- is still running/queued. A stale run older than 12 minutes is allowed
  -- to be superseded so a permanently stuck run cannot disable the system.
  select status, started_at
    into latest_status, latest_started_at
    from public.trademind_scheduler_runs
   where status in ('QUEUED', 'RUNNING')
   order by created_at desc
   limit 1;

  if latest_status is not null
     and latest_started_at > now() - interval '12 minutes' then
    raise log 'TradeMindMZ scheduler skipped overlapping run: status=%, started_at=%',
      latest_status, latest_started_at;
    return 0;
  end if;

  insert into public.trademind_scheduler_runs (
    status,
    started_at
  )
  values (
    'QUEUED',
    now()
  )
  returning id into scheduler_run_id;

  raise log 'TradeMindMZ scheduler trigger fired at %, run_id=%',
    now(), scheduler_run_id;

  begin
    select net.http_post(
      url := 'https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/trademind-api/api/ai/scheduled-scan',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-trademind-scheduler', scheduler_secret
      ),
      body := jsonb_build_object(
        'source', 'supabase-cron',
        'scheduledAt', now(),
        'schedulerRunId', scheduler_run_id
      ),
      timeout_milliseconds := 120000
    )
    into request_id;
  exception
    when others then
      update public.trademind_scheduler_runs
         set status = 'ERROR',
             finished_at = now(),
             error = 'pg_net enqueue failed: ' || sqlerrm
       where id = scheduler_run_id;
      raise;
  end;

  return request_id;
end;
$$;

revoke execute on function public.trademind_run_ai_scheduler() from public, anon, authenticated;

notify pgrst, 'reload schema';

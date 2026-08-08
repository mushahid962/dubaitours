-- =====================================================================
-- 0013_scheduled_jobs.sql
--
-- Moves recurring work from Vercel Cron into the database.
--
-- Two reasons, and the second matters more than the first:
--
--   1. Vercel's Hobby plan allows one cron run per DAY. The seat-hold reaper
--      has to run every minute — a hold expires after 15 minutes, and a
--      daily sweep would leave seats unsellable for up to 24 hours.
--
--   2. The reaper should not depend on the web tier being healthy. If the
--      site is down, inventory should still be released. pg_cron runs inside
--      Postgres, so it keeps working when nothing else does.
--
-- The /api/cron/* routes stay in place as a manual trigger and as a fallback
-- for anyone who prefers Vercel Cron on a paid plan.
-- =====================================================================

-- pg_cron must be enabled once per project:
--   Supabase Dashboard → Database → Extensions → enable "pg_cron"
--
-- A bare `create extension` would abort this whole migration on a project
-- where it is unavailable, so the failure is caught and reported instead.
do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron unavailable (%). Jobs will not be scheduled — see the notice below.', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice '---------------------------------------------------------------';
    raise notice 'pg_cron is NOT enabled, so nothing is scheduled.';
    raise notice 'Enable it: Dashboard -> Database -> Extensions -> pg_cron,';
    raise notice 'then run this migration again.';
    raise notice 'Until then, seats held by abandoned checkouts are never released.';
    raise notice '---------------------------------------------------------------';
    return;
  end if;

  -- Release seats from abandoned checkouts. Every minute, because a traveller
  -- who abandons at 14:00 should not block a sale at 14:16.
  perform cron.unschedule('expire-stale-holds') where exists (
    select 1 from cron.job where jobname = 'expire-stale-holds');
  perform cron.schedule('expire-stale-holds', '* * * * *',
    $job$select public.expire_stale_holds()$job$);

  -- Popularity feeds ranking on every listing page. Nightly is plenty.
  perform cron.unschedule('refresh-popularity') where exists (
    select 1 from cron.job where jobname = 'refresh-popularity');
  perform cron.schedule('refresh-popularity', '15 2 * * *',
    $job$select public.refresh_popularity_scores()$job$);

  -- Homepage counters.
  perform cron.unschedule('refresh-homepage-stats') where exists (
    select 1 from cron.job where jobname = 'refresh-homepage-stats');
  perform cron.schedule('refresh-homepage-stats', '5 * * * *',
    $job$select public.refresh_homepage_stats()$job$);

  -- Mark past departures complete so payouts can include them and travellers
  -- can be asked for a review.
  perform cron.unschedule('complete-past-bookings') where exists (
    select 1 from cron.job where jobname = 'complete-past-bookings');
  perform cron.schedule('complete-past-bookings', '30 3 * * *',
    $job$select public.complete_past_bookings()$job$);

  raise notice 'Scheduled 4 jobs. Check them with: select jobname, schedule from cron.job;';
end $$;

-- Confirms the jobs are alive and succeeding:
--   select * from scheduled_job_status;
-- Created only when pg_cron exists, since it reads cron's own tables.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $view$
      create or replace view scheduled_job_status
      with (security_invoker = true) as
      select j.jobname, j.schedule, j.active,
             d.status as last_status, d.start_time as last_run, d.return_message
      from cron.job j
      left join lateral (
        select status, start_time, return_message
        from cron.job_run_details
        where jobid = j.jobid
        order by start_time desc limit 1
      ) d on true
    $view$;
  end if;
end $$;

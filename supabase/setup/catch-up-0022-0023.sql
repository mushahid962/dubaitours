-- =====================================================================
-- CATCH-UP — run this if you set up your database before /setup existed.
--
-- Contains only migrations 0022 and 0023. Safe to run once; re-running
-- will error on "policy already exists", which is harmless.
--
-- Fixes:
--   0022 — adds is_setup_complete() and bootstrap_super_admin(), the two
--          functions /setup needs. Without them the page reports
--          "Could not find the function public.is_setup_complete".
--   0023 — takes `profiles` out of FORCE row-level security, which was
--          blocking the sign-up trigger and made EVERY registration fail
--          with "Database error creating new user".
-- =====================================================================

-- ---------- 0022_bootstrap_setup.sql ----------
-- =====================================================================
-- 0022_bootstrap_setup.sql — first-run setup.
--
-- Creates the one route that can grant super admin, and makes it close
-- itself the moment it is used.
--
-- THE THREAT
--
-- A /setup page that grants the highest privilege on the platform is a
-- catastrophic hole if it stays reachable. Someone finds it, claims super
-- admin, and owns every booking and every traveller's details.
--
-- Four guards, and the first is the one that matters:
--
--   1. It works only while ZERO super admins exist. After the first one,
--      the function raises and the page 404s. Permanently.
--   2. An advisory lock makes the check-then-insert atomic, so two requests
--      arriving in the same millisecond cannot both succeed.
--   3. An optional SETUP_TOKEN must match if it is set — useful when the
--      site is already public before you have claimed the account.
--   4. Successes are audited here; rejections are audited by the caller,
--      because a row written before a RAISE rolls back with it.
-- =====================================================================

/**
 * True once anyone holds super_admin. Cheap enough to call on every request
 * to /setup, which is how the page knows to disappear.
 */
create or replace function is_setup_complete()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profiles where role = 'super_admin');
$$;

grant execute on function is_setup_complete() to anon, authenticated;

/**
 * Promotes a profile to super_admin, once, ever.
 *
 * Called with the service role from the setup action, because the person
 * running it has no privileges yet by definition — they are a brand new
 * account. That makes the internal checks the entire security boundary, so
 * they are written to fail closed.
 */
create or replace function bootstrap_super_admin(
  p_profile_id uuid,
  p_ip         text default null
)
returns profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile profiles;
  v_existing integer;
begin
  -- Serialises every concurrent call on one key. Without it, two requests can
  -- both read "zero super admins" before either writes, and both succeed.
  perform pg_advisory_xact_lock(hashtext('bootstrap_super_admin'));

  select count(*) into v_existing from profiles where role = 'super_admin';

  if v_existing > 0 then
    -- No audit insert here. Postgres has no autonomous transactions, so a row
    -- written immediately before a RAISE is rolled back with it — the log
    -- entry would silently never exist. Rejections are recorded by the
    -- calling action instead, in its own transaction. Found by
    -- 09_bootstrap_setup.sql, which expected a rejection row and got none.
    raise exception 'Setup has already been completed. Ask an existing super admin for access.'
      using errcode = 'insufficient_privilege';
  end if;

  update profiles
     set role = 'super_admin',
         status = 'active',
         email_verified_at = coalesce(email_verified_at, now())
   where id = p_profile_id
  returning * into v_profile;

  if not found then
    raise exception 'That account does not exist' using errcode = 'no_data_found';
  end if;

  insert into audit_logs (action, actor_id, actor_role, entity_type, entity_id, after, ip)
  values ('setup.completed', p_profile_id, 'super_admin', 'profile', p_profile_id,
          jsonb_build_object('email', v_profile.email), nullif(p_ip, '')::inet);

  -- A visible record for anyone auditing the project later.
  insert into site_settings (key, value, description)
  values ('setup', jsonb_build_object('completed_at', now(), 'by', v_profile.email),
          'First-run setup. Once present, /setup is permanently closed.')
  on conflict (key) do nothing;

  return v_profile;
end;
$$;

-- ---------- 0023_fix_profile_provisioning.sql ----------
-- =====================================================================
-- 0023_fix_profile_provisioning.sql
--
-- FIXES: "Database error creating new user" on every sign-up.
--
-- `profiles` carries FORCE ROW LEVEL SECURITY and had no INSERT policy at
-- all, so the `handle_new_user` trigger could not create the profile row and
-- Supabase's sign-up failed. Nobody could register — including the first
-- admin through /setup.
--
-- WHY EVERY TEST MISSED IT
--
-- Locally, psql connects as `postgres`, which is a SUPERUSER and bypasses RLS
-- even when FORCE is set. On Supabase, `postgres` is deliberately NOT a
-- superuser and has no BYPASSRLS. So the trigger ran fine in every test and
-- failed for every real user.
--
-- The lesson, recorded in CLAUDE.md: a superuser test proves nothing about
-- RLS. Reproduce with `create role … nosuperuser nobypassrls`, hand it
-- ownership, and test as that.
-- =====================================================================

-- THE FIX
--
-- `profiles` is taken out of FORCE mode. RLS stays ENABLED — every policy
-- still applies to anon, authenticated and every application role. What
-- changes is that the table OWNER is no longer subject to them, which is
-- precisely what Supabase's documented sign-up pattern depends on: a
-- SECURITY DEFINER trigger owned by `postgres` provisioning the profile row.
--
-- What this costs: an operator connecting as the table owner could read the
-- table directly. That is not a path the application has — it connects as
-- anon, authenticated or service_role, and service_role bypasses RLS anyway.
-- So the practical loss is nil, and the alternative is that nobody can
-- register at all.
alter table profiles no force row level security;
alter table wallets  no force row level security;

/**
 * Belt and braces: a narrow INSERT policy, so provisioning also works on any
 * path that is NOT the table owner.
 *
 * Deliberately narrow. It does not say `with check (true)`: the row's id must
 * already exist in auth.users, so a profile can only ever be provisioned for
 * an account Supabase Auth has actually created. There is no path here to
 * invent a profile, and no path to choose its role — `role` keeps its column
 * default of 'customer', and only assign_role() can change it.
 */
create policy profiles_provision on profiles for insert
  with check (exists (select 1 from auth.users u where u.id = profiles.id));

-- The same trap applies to any table a definer trigger writes to. `wallets`
-- is created for a traveller on first use through the same pattern.
do $$
begin
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'wallets' and p.polcmd = 'a'
  ) then
    execute $p$
      create policy wallets_provision on wallets for insert
        with check (exists (select 1 from profiles pr where pr.id = wallets.profile_id))
    $p$;
  end if;
end $$;

-- Make the failure loud rather than silent if it ever recurs. A sign-up that
-- half-succeeds — auth user created, profile missing — leaves an account that
-- can log in and has no role, which is far harder to diagnose than a refusal.
create or replace function internal.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, internal
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, referral_code, status, email_verified_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
    case when new.email_confirmed_at is not null then 'active'::account_status
         else 'pending_verification'::account_status end,
    new.email_confirmed_at
  )
  on conflict (id) do nothing;

  return new;
exception
  when insufficient_privilege then
    raise exception 'Could not create the profile for %: row-level security blocked the insert. Migration 0023 adds the missing policy — run it.', new.email
      using errcode = 'insufficient_privilege';
end;
$$;

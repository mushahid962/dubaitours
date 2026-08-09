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

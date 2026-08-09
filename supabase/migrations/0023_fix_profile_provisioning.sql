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

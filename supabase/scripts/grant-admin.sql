-- =====================================================================
-- grant-admin.sql — make yourself a super admin.
--
-- Run in the Supabase SQL Editor AFTER you have signed up on the site.
-- Change the email on the next line to yours, then run the whole file.
-- =====================================================================
\set target_email 'you@example.com'

-- Or, if your client does not support \set, replace the email in each
-- statement below directly.

do $$
declare
  v_email text := 'you@example.com';   -- ← CHANGE THIS
  v_id    uuid;
  v_confirmed timestamptz;
begin
  select id, email_confirmed_at into v_id, v_confirmed
  from auth.users where lower(email) = lower(v_email);

  if v_id is null then
    raise exception 'No account for %. Sign up on the site first, then run this again.', v_email;
  end if;

  -- Two separate things, and both are required.
  --
  -- `role` decides WHAT you may do. `status` decides WHETHER you may do
  -- anything at all — has_permission() returns false for any account that is
  -- not 'active', whatever its role. Setting the role alone leaves you a
  -- super admin who can do nothing, which is a confusing five minutes.
  update public.profiles
     set role   = 'super_admin',
         status = 'active',
         email_verified_at = coalesce(email_verified_at, v_confirmed, now())
   where id = v_id;

  if v_confirmed is null then
    raise notice 'Note: % has not confirmed their email. Status has been forced to active here, but confirm the link anyway so password reset works.', v_email;
  end if;

  raise notice 'Done. % is now super_admin and active.', v_email;
end $$;

-- Confirm it worked. role should be super_admin, status active.
select p.role, p.status, p.email, p.email_verified_at is not null as verified
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('you@example.com');   -- ← CHANGE THIS TOO

-- What you can now do. Should return 19 rows.
select category, code from role_matrix where role = 'super_admin' order by category, code;

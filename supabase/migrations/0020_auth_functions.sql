-- =====================================================================
-- 0020_auth_functions.sql — PHASE 1 (part 3): authorization helpers.
--
-- Every function here is the thing RLS policies actually call, so each is
-- `stable` and `security definer` — stable lets the planner evaluate once per
-- statement instead of once per row, which is the difference between a fast
-- policy and a table scan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. IDENTITY
-- ---------------------------------------------------------------------
create or replace function auth_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

/**
 * Whether the caller's account is usable at all.
 *
 * Deliberately separate from role. A suspended super admin must lose every
 * power immediately, and checking role alone would leave them fully
 * privileged until someone remembers to also change it.
 */
create or replace function auth_active()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active' and deleted_at is null
  );
$$;

/**
 * The single authorization primitive. Everything else is a convenience
 * wrapper around it, so there is one place to audit and one place to change.
 */
create or replace function has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth_active() and exists (
    select 1 from role_permissions rp
    where rp.role = auth_role() and rp.permission = p_permission
  );
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth_active() and coalesce(auth_role() in ('admin','super_admin'), false);
$$;

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth_active() and coalesce(auth_role() = 'super_admin', false);
$$;

/**
 * "Staff" now means any internal role, which is what most policies want.
 * Note the account-status gate: a suspended content manager reads nothing.
 */
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth_active() and coalesce(
    auth_role() in ('content_manager','booking_manager','support_agent','admin','super_admin'),
    false);
$$;

/** Business-side roles, used to decide which dashboard someone lands on. */
create or replace function is_business_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth_active() and coalesce(
    auth_role() in ('business_owner','business_staff','tour_operator','hotel_manager'),
    false);
$$;

create or replace function is_company_member(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth_active() and exists (
    select 1 from company_members cm
    where cm.company_id = p_company_id
      and cm.profile_id = auth.uid()
      and cm.accepted_at is not null
  );
$$;

-- ---------------------------------------------------------------------
-- 2. ACCOUNT LIFECYCLE
-- ---------------------------------------------------------------------

/**
 * Marks a profile verified and active once Supabase confirms the email.
 * A profile stays `pending_verification` until this runs, which is what stops
 * an unverified address from booking or reviewing.
 */
create or replace function internal.sync_email_verification()
returns trigger
language plpgsql security definer set search_path = public, auth, internal
as $$
begin
  update public.profiles p
     set email = new.email,
         email_verified_at = new.email_confirmed_at,
         status = case
           when p.status in ('suspended','banned','deactivated') then p.status
           when new.email_confirmed_at is not null then 'active'::account_status
           else 'pending_verification'::account_status
         end,
         last_login_at = coalesce(new.last_sign_in_at, p.last_login_at)
   where p.id = new.id;
  return null;
end;
$$;

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
  after update of email_confirmed_at, last_sign_in_at, email on auth.users
  for each row execute function internal.sync_email_verification();

-- Provision a profile on sign-up, now carrying email and status.
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
end;
$$;

/**
 * Role assignment. Restricted to super admins, because a role is the only
 * thing standing between an account and every booking on the platform.
 *
 * Two rules encoded here that an `update` statement could not express:
 *   - nobody may change their own role, including a super admin
 *   - the last remaining super admin cannot be demoted, or the platform
 *     locks itself out with no way back in short of direct SQL
 */
create or replace function assign_role(p_profile_id uuid, p_role user_role, p_reason text default null)
returns profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile profiles;
  v_old     user_role;
begin
  if not is_super_admin() then
    raise exception 'Only a super admin can change roles' using errcode = 'insufficient_privilege';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = 'insufficient_privilege';
  end if;

  select role into v_old from profiles where id = p_profile_id;
  if not found then
    raise exception 'That account does not exist' using errcode = 'no_data_found';
  end if;

  if v_old = 'super_admin' and p_role <> 'super_admin'
     and (select count(*) from profiles where role = 'super_admin' and status = 'active') <= 1 then
    raise exception 'This is the last active super admin. Promote someone else first.'
      using errcode = 'invalid_parameter_value';
  end if;

  update profiles set role = p_role where id = p_profile_id returning * into v_profile;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (auth.uid(), auth_role(), 'user.assign_role', 'profile', p_profile_id,
          jsonb_build_object('role', v_old),
          jsonb_build_object('role', p_role, 'reason', p_reason));

  return v_profile;
end;
$$;

create or replace function set_account_status(
  p_profile_id uuid, p_status account_status, p_reason text default null
)
returns profiles
language plpgsql security definer set search_path = public
as $$
declare v_profile profiles;
begin
  if not has_permission('users.suspend') then
    raise exception 'You do not have permission to change account status'
      using errcode = 'insufficient_privilege';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'You cannot change your own account status' using errcode = 'insufficient_privilege';
  end if;
  if p_status in ('suspended','banned') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when suspending an account'
      using errcode = 'invalid_parameter_value';
  end if;
  -- An admin must not be able to suspend a super admin from under them.
  if (select role from profiles where id = p_profile_id) = 'super_admin' and not is_super_admin() then
    raise exception 'Only a super admin can change another super admin'
      using errcode = 'insufficient_privilege';
  end if;

  update profiles
     set status = p_status,
         suspended_reason = case when p_status in ('suspended','banned') then p_reason else null end,
         suspended_at     = case when p_status in ('suspended','banned') then now() else null end,
         suspended_by     = case when p_status in ('suspended','banned') then auth.uid() else null end,
         deactivated_at   = case when p_status = 'deactivated' then now() else null end
   where id = p_profile_id
  returning * into v_profile;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'user.set_status', 'profile', p_profile_id,
          jsonb_build_object('status', p_status, 'reason', p_reason));

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. RECREATED FUNCTIONS
-- These held the old role names as text inside their bodies, which a
-- `RENAME VALUE` cannot reach.
-- ---------------------------------------------------------------------
create or replace function approve_company_application(
  p_application_id uuid, p_commission_rate numeric default 20.00, p_note text default null
)
returns companies
language plpgsql security definer set search_path = public
as $$
declare
  v_app company_applications; v_company companies; v_slug text; v_suffix integer := 0;
begin
  if not has_permission('businesses.approve') then
    raise exception 'Only an administrator can approve an application'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from company_applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;
  if v_app.status = 'approved' then
    return (select c from companies c where c.id = v_app.company_id);
  end if;
  if v_app.status not in ('submitted','under_review','needs_info') then
    raise exception 'Cannot approve an application with status %', v_app.status
      using errcode = 'invalid_parameter_value';
  end if;

  v_slug := internal.slugify(v_app.display_name);
  while exists (select 1 from companies where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := internal.slugify(v_app.display_name) || '-' || v_suffix;
  end loop;

  insert into companies (
    slug, legal_name, display_name, status, verification, country_id, city_id,
    contact_email, contact_phone, whatsapp, website, about,
    trade_license_no, trade_license_url, tax_registration_no,
    commission_rate, payout_currency, onboarded_at
  )
  select v_slug, v_app.legal_name, v_app.display_name, 'active', 'verified',
         v_app.country_id, v_app.city_id, v_app.contact_email, v_app.contact_phone,
         v_app.whatsapp, v_app.website, v_app.about,
         v_app.trade_license_no, v_app.trade_license_url, v_app.tax_registration_no,
         p_commission_rate, c.currency, now()
  from countries c where c.id = v_app.country_id
  returning * into v_company;

  insert into company_members (company_id, profile_id, role, permissions, accepted_at)
  values (v_company.id, v_app.submitted_by, 'business_owner',
          array['listings.write.own','bookings.read.own','payments.read','reviews.reply.own'], now());

  -- Only promote a plain customer. An admin who also runs a tour company must
  -- not be demoted by approving their own application.
  update profiles set role = 'business_owner'
   where id = v_app.submitted_by and role = 'customer';

  update company_applications
     set status = 'approved', company_id = v_company.id,
         reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_note
   where id = p_application_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'company_application.approve', 'company', v_company.id,
          jsonb_build_object('application_id', p_application_id, 'slug', v_slug,
                             'commission_rate', p_commission_rate));
  return v_company;
end;
$$;

create or replace function approve_listing_claim(p_claim_id uuid, p_note text default null)
returns listing_claims
language plpgsql security definer set search_path = public
as $$
declare v_claim listing_claims;
begin
  if not has_permission('businesses.approve') then
    raise exception 'Only an administrator can approve a claim' using errcode = 'insufficient_privilege';
  end if;

  select * into v_claim from listing_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found' using errcode = 'no_data_found';
  end if;
  if v_claim.status = 'approved' then return v_claim; end if;

  insert into company_members (company_id, profile_id, role, permissions, accepted_at)
  values (v_claim.company_id, v_claim.claimant_id, 'business_owner',
          array['listings.write.own','bookings.read.own','payments.read','reviews.reply.own'], now())
  on conflict (company_id, profile_id) do nothing;

  update profiles set role = 'business_owner'
   where id = v_claim.claimant_id and role = 'customer';

  update listing_claims
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), decision_note = p_note
   where id = p_claim_id
  returning * into v_claim;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'listing_claim.approve', 'company', v_claim.company_id,
          jsonb_build_object('claim_id', p_claim_id, 'claimant', v_claim.claimant_id));
  return v_claim;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. PROFILE POLICIES
-- ---------------------------------------------------------------------
drop policy if exists profiles_self_read on profiles;
drop policy if exists profiles_self_update on profiles;
drop policy if exists profiles_admin_all on profiles;

create policy profiles_self_read on profiles for select
  using (id = auth.uid() or has_permission('users.read'));

-- Role and status are pinned to their current values: they are changed only
-- by assign_role() and set_account_status(), which check the caller and
-- write an audit entry. Without this clause, self-promotion is one UPDATE.
create policy profiles_self_update on profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = auth_role()
    and status = (select p.status from profiles p where p.id = auth.uid())
  );

create policy profiles_admin_read on profiles for select using (has_permission('users.read'));

-- A view of who can do what, for the admin team screen.
create or replace view role_matrix
with (security_invoker = true) as
select rp.role, p.category, p.code, p.description
from role_permissions rp
join permissions p on p.code = rp.permission
order by rp.role, p.category, p.code;

grant select on role_matrix to authenticated;

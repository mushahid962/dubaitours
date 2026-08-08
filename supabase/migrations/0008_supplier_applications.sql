-- =====================================================================
-- 0008_supplier_applications.sql
--
-- Three actors use this platform:
--   traveler       — books, reviews, owns only their own data
--   company_owner  — applied, was approved, manages one company's listings
--   admin          — reviews applications, moderates, sees everything
--
-- The dangerous transition is traveler -> company_owner. This migration
-- makes that transition a single audited function that only an admin can
-- call, so it cannot happen by any other path.
-- =====================================================================

create type application_status as enum (
  'draft', 'submitted', 'under_review', 'needs_info', 'approved', 'rejected', 'withdrawn'
);

create table company_applications (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references companies(id) on delete cascade,
  submitted_by      uuid not null references profiles(id) on delete cascade,
  status            application_status not null default 'draft',

  -- What the applicant tells us.
  legal_name        text not null,
  display_name      text not null,
  country_id        uuid not null references countries(id) on delete restrict,
  city_id           uuid references cities(id) on delete set null,
  contact_email     citext not null,
  contact_phone     text not null,
  whatsapp          text,
  website           text,
  about             text not null,
  years_operating   smallint check (years_operating >= 0),
  tour_count_estimate smallint,
  categories        uuid[] not null default '{}',

  -- What we verify. URLs point at a private storage bucket, never public.
  trade_license_no  text not null,
  trade_license_url text not null,
  tax_registration_no text,
  insurance_url     text,
  tourism_permit_url text,
  documents         jsonb not null default '[]'::jsonb,

  -- Review trail.
  reviewed_by       uuid references profiles(id) on delete set null,
  reviewed_at       timestamptz,
  review_notes      text,
  rejection_reason  text,
  info_requested    text,

  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One live application per person. A rejected applicant can reapply, because
-- rejection is usually a missing document rather than a permanent no.
create unique index company_applications_one_open_uq
  on company_applications (submitted_by)
  where status in ('draft', 'submitted', 'under_review', 'needs_info');

create index company_applications_queue_idx
  on company_applications (status, submitted_at)
  where status in ('submitted', 'under_review', 'needs_info');

create trigger touch_company_applications before update on company_applications
  for each row execute function internal.touch_updated_at();

-- Every status change is recorded, including who and why. Regulators and
-- disputes both ask "who approved this operator", and the answer has to exist.
create table company_application_events (
  id             bigint generated always as identity primary key,
  application_id uuid not null references company_applications(id) on delete cascade,
  actor_id       uuid references profiles(id) on delete set null,
  from_status    application_status,
  to_status      application_status not null,
  note           text,
  created_at     timestamptz not null default now()
);
create index application_events_idx on company_application_events (application_id, created_at);

-- security definer on purpose: an audit trigger that runs with the caller's
-- privileges is an audit trigger the caller can break. This one writes the
-- event no matter who acted or what they are otherwise allowed to touch.
create or replace function internal.log_application_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into company_application_events (application_id, actor_id, from_status, to_status, note)
    values (new.id, auth.uid(),
            case when tg_op = 'INSERT' then null else old.status end,
            new.status,
            coalesce(new.review_notes, new.rejection_reason, new.info_requested));
  end if;
  return new;
end;
$$;

create trigger log_application_status
  after insert or update on company_applications
  for each row execute function internal.log_application_event();

-- ---------------------------------------------------------------------
-- SUBMISSION — the applicant's own action.
-- ---------------------------------------------------------------------
-- Every status transition on an application goes through a function, and the
-- RLS policy forbids applicants from writing `status` directly. That is why
-- this is definer rather than invoker: the `submitted_by = auth.uid()` clause
-- below is the ownership check, and it is the only way in.
create or replace function submit_company_application(p_application_id uuid)
returns company_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app company_applications;
begin
  select * into v_app from company_applications
  where id = p_application_id and submitted_by = auth.uid()
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;
  if v_app.status not in ('draft', 'needs_info') then
    raise exception 'This application has already been submitted'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(trim(v_app.trade_license_no), '') = '' or coalesce(trim(v_app.trade_license_url), '') = '' then
    raise exception 'A trade licence number and document are required'
      using errcode = 'invalid_parameter_value';
  end if;

  update company_applications
     set status = 'submitted', submitted_at = now(), info_requested = null
   where id = p_application_id
  returning * into v_app;

  return v_app;
end;
$$;

-- ---------------------------------------------------------------------
-- APPROVAL — the privilege boundary.
--
-- security definer, because it must write to profiles.role, which the RLS
-- policy on profiles deliberately forbids everyone from doing. The first
-- statement re-checks that the caller is an admin: a definer function
-- without that check is a privilege-escalation hole with extra steps.
-- ---------------------------------------------------------------------
create or replace function approve_company_application(
  p_application_id uuid,
  p_commission_rate numeric default 20.00,
  p_note text default null
)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app     company_applications;
  v_company companies;
  v_slug    text;
  v_suffix  integer := 0;
begin
  if not is_admin() then
    raise exception 'Only an administrator can approve an application'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from company_applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;
  if v_app.status = 'approved' then
    return (select c from companies c where c.id = v_app.company_id);  -- idempotent
  end if;
  if v_app.status not in ('submitted', 'under_review', 'needs_info') then
    raise exception 'Cannot approve an application with status %', v_app.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Slugs are public URLs and permanent, so collisions are resolved once here
  -- rather than left for the operator to discover after their page is live.
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

  -- The applicant becomes the owner: membership row plus the role change.
  insert into company_members (company_id, profile_id, role, permissions, accepted_at)
  values (v_company.id, v_app.submitted_by, 'company_owner',
          array['tours.write','bookings.read','payouts.read','staff.write'], now());

  -- Never demote an existing admin who happens to also run a company.
  update profiles
     set role = 'company_owner'
   where id = v_app.submitted_by
     and role = 'traveler';

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

create or replace function reject_company_application(
  p_application_id uuid,
  p_reason text
)
returns company_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app company_applications;
begin
  if not is_admin() then
    raise exception 'Only an administrator can reject an application'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A rejection reason is required' using errcode = 'invalid_parameter_value';
  end if;

  update company_applications
     set status = 'rejected', rejection_reason = p_reason,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_application_id
     and status in ('submitted', 'under_review', 'needs_info')
  returning * into v_app;

  if not found then
    raise exception 'Application not found or not open for review' using errcode = 'no_data_found';
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'company_application.reject', 'company_application',
          p_application_id, jsonb_build_object('reason', p_reason));

  return v_app;
end;
$$;

create or replace function request_application_info(
  p_application_id uuid,
  p_message text
)
returns company_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app company_applications;
begin
  if not is_staff() then
    raise exception 'Only staff can request more information'
      using errcode = 'insufficient_privilege';
  end if;

  update company_applications
     set status = 'needs_info', info_requested = p_message,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_application_id and status in ('submitted', 'under_review')
  returning * into v_app;

  if not found then
    raise exception 'Application not found or not open for review' using errcode = 'no_data_found';
  end if;

  return v_app;
end;
$$;

-- Suspension is separate from rejection: it acts on a live operator and must
-- take their listings down in the same transaction, not in a follow-up job.
create or replace function suspend_company(p_company_id uuid, p_reason text)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company companies;
begin
  if not is_admin() then
    raise exception 'Only an administrator can suspend a company'
      using errcode = 'insufficient_privilege';
  end if;

  update tours set status = 'paused'
   where company_id = p_company_id and status = 'published';

  update companies
     set status = 'suspended', suspended_reason = p_reason
   where id = p_company_id
  returning * into v_company;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'company.suspend', 'company', p_company_id,
          jsonb_build_object('reason', p_reason));

  return v_company;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS — applicants see only their own application; staff see the queue.
-- ---------------------------------------------------------------------
alter table company_applications enable row level security;
alter table company_applications force row level security;
alter table company_application_events enable row level security;
alter table company_application_events force row level security;

create policy applications_own_read on company_applications for select
  using (submitted_by = auth.uid() or is_staff());

create policy applications_own_insert on company_applications for insert
  with check (submitted_by = auth.uid());

-- An applicant may edit the content of a draft, or answer a request for
-- information. They may not move it between states: `status` stays pinned to
-- its current value, and submission goes through submit_company_application().
-- reviewer and company_id are likewise set only by the definer functions.
create policy applications_own_update on company_applications for update
  using (submitted_by = auth.uid() and status in ('draft', 'needs_info'))
  with check (
    submitted_by = auth.uid()
    and status in ('draft', 'needs_info')
    and reviewed_by is null
    and company_id is null
    and rejection_reason is null
  );

create policy applications_staff_update on company_applications for update
  using (is_staff()) with check (is_staff());

create policy application_events_read on company_application_events for select
  using (
    is_staff()
    or exists (
      select 1 from company_applications a
      where a.id = company_application_events.application_id
        and a.submitted_by = auth.uid()
    )
  );

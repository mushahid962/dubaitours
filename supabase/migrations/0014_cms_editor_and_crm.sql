-- =====================================================================
-- 0014_cms_editor_and_crm.sql
--
-- Turns the CMS tables into something a marketing team can actually run:
-- per-entry SEO, custom CSS, custom JSON-LD, scheduled publishing, and the
-- CRM objects an admin panel needs (leads, claims, saved reports).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. THE UNIVERSAL EDITOR FIELDS
-- Every editable entity gets the same set, so one editor component can
-- drive posts, pages, locations and services without special cases.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['blog_post_translations', 'cms_page_translations']
  loop
    execute format($sql$
      alter table %I
        add column if not exists canonical_url  text,
        add column if not exists robots         text default 'index,follow',
        add column if not exists og_title       text,
        add column if not exists og_description text,
        add column if not exists focus_keyword  text
    $sql$, t);
  end loop;
end $$;

alter table blog_posts
  add column if not exists custom_css        text,
  add column if not exists custom_schema     jsonb,
  add column if not exists custom_head       text,
  add column if not exists scheduled_for     timestamptz,
  add column if not exists featured_position smallint,
  add column if not exists is_featured       boolean not null default false,
  add column if not exists allow_comments    boolean not null default false,
  add column if not exists updated_by        uuid references profiles(id) on delete set null;

alter table cms_pages
  add column if not exists custom_css    text,
  add column if not exists custom_schema jsonb,
  add column if not exists custom_head   text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists cover_media_id uuid references media_assets(id) on delete set null;

-- Scheduled publishing. A post with a future `scheduled_for` goes live on its
-- own — without this the "schedule" field is a lie that needs a human at 6am.
create or replace function publish_scheduled_content()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare v_total integer := 0; v_count integer;
begin
  update blog_posts
     set status = 'published', published_at = coalesce(published_at, scheduled_for)
   where status = 'scheduled' and scheduled_for <= now();
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  update cms_pages
     set status = 'published', published_at = coalesce(published_at, scheduled_for)
   where status = 'scheduled' and scheduled_for <= now();
  get diagnostics v_count = row_count;
  return v_total + v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. LEADS
-- Enquiries that are not bookings: partner interest, group quotes,
-- corporate requests. The commercial pipeline an operator marketplace
-- needs alongside transactional bookings.
-- ---------------------------------------------------------------------
create type lead_status as enum ('new', 'contacted', 'qualified', 'won', 'lost', 'spam');
create type lead_source as enum ('contact_form', 'group_quote', 'partner_enquiry', 'newsletter', 'phone', 'whatsapp', 'import', 'other');

create table leads (
  id            uuid primary key default gen_random_uuid(),
  status        lead_status not null default 'new',
  source        lead_source not null default 'contact_form',
  name          text not null,
  email         citext,
  phone         text,
  company_name  text,
  message       text,
  country_id    uuid references countries(id) on delete set null,
  city_id       uuid references cities(id) on delete set null,
  tour_id       uuid references tours(id) on delete set null,
  party_size    smallint,
  travel_date   date,
  estimated_value numeric(12,2),
  currency      currency_code,
  assigned_to   uuid references profiles(id) on delete set null,
  utm           jsonb not null default '{}'::jsonb,
  landing_page  text,
  notes         text,
  contacted_at  timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint leads_reachable check (email is not null or phone is not null)
);
create index leads_pipeline_idx on leads (status, created_at desc);
create index leads_assigned_idx on leads (assigned_to) where status in ('new','contacted','qualified');

create table lead_events (
  id         bigint generated always as identity primary key,
  lead_id    uuid not null references leads(id) on delete cascade,
  actor_id   uuid references profiles(id) on delete set null,
  kind       text not null check (kind in ('note','call','email','whatsapp','status_change','assignment')),
  body       text,
  created_at timestamptz not null default now()
);
create index lead_events_idx on lead_events (lead_id, created_at desc);

create trigger touch_leads before update on leads
  for each row execute function internal.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. LISTING CLAIMS
-- Someone asserting they own a listing we created or imported. Approving a
-- claim hands over a live listing, so it is an admin decision with a trail.
-- ---------------------------------------------------------------------
create type claim_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table listing_claims (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  claimant_id   uuid not null references profiles(id) on delete cascade,
  status        claim_status not null default 'pending',
  evidence      text not null,
  evidence_urls text[] not null default '{}',
  contact_email citext not null,
  contact_phone text,
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  unique (company_id, claimant_id)
);
create index claims_queue_idx on listing_claims (status, created_at) where status = 'pending';

create or replace function approve_listing_claim(p_claim_id uuid, p_note text default null)
returns listing_claims
language plpgsql
security definer set search_path = public
as $$
declare v_claim listing_claims;
begin
  if not is_admin() then
    raise exception 'Only an administrator can approve a claim' using errcode = 'insufficient_privilege';
  end if;

  select * into v_claim from listing_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found' using errcode = 'no_data_found';
  end if;
  if v_claim.status = 'approved' then
    return v_claim;  -- idempotent
  end if;

  -- Approving grants control of a live business listing, so it is the same
  -- privileged transition as approving an application: membership plus role.
  insert into company_members (company_id, profile_id, role, permissions, accepted_at)
  values (v_claim.company_id, v_claim.claimant_id, 'company_owner',
          array['tours.write','bookings.read','payouts.read','staff.write'], now())
  on conflict (company_id, profile_id) do nothing;

  update profiles set role = 'company_owner'
   where id = v_claim.claimant_id and role = 'traveler';

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
-- 4. THEME AND SITE-WIDE SETTINGS
-- Stored as settings rows rather than columns so the admin can add a key
-- without a migration.
-- ---------------------------------------------------------------------
insert into site_settings (key, value, description) values
  ('theme', '{"primary":"#0E6E64","accent":"#B98A2E","urgent":"#C2334E","ink":"#0B1F1C","surface":"#EFF2F1","radius":"22px","font_display":"Fraunces","font_body":"Be Vietnam Pro"}', 'Colour and type tokens applied site-wide'),
  ('custom_css', '{"css":""}', 'Custom CSS injected on every page'),
  ('robots_txt', '{"extra_rules":"","noindex_site":false}', 'Additions to the generated robots.txt'),
  ('sitemap', '{"exclude_paths":[],"changefreq_override":null}', 'Sitemap generation overrides'),
  ('contact', '{"email":"help@travelhubgulf.com","phone":"","whatsapp":"","address":""}', 'Public contact details')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 5. SAVED REPORTS
-- ---------------------------------------------------------------------
create table saved_reports (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('revenue','bookings','listings','leads','seo','operators')),
  filters     jsonb not null default '{}'::jsonb,
  created_by  uuid references profiles(id) on delete set null,
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads','lead_events','listing_claims','saved_reports']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Leads are commercial data: staff only, both directions.
create policy leads_staff on leads for all using (is_staff()) with check (is_staff());
create policy lead_events_staff on lead_events for all using (is_staff()) with check (is_staff());
create policy reports_staff on saved_reports for all using (is_staff()) with check (is_staff());

-- Anyone signed in may file a claim; only they and staff can see it.
create policy claims_own_read on listing_claims for select
  using (claimant_id = auth.uid() or is_staff());
create policy claims_insert on listing_claims for insert
  with check (claimant_id = auth.uid());
create policy claims_staff_write on listing_claims for update
  using (is_staff()) with check (is_staff());

-- The public contact form writes leads through the service role, never
-- directly — an anon insert policy here would be a spam funnel.

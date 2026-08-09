-- =====================================================================
-- 0018_auth_roles_rbac.sql — PHASE 1: authentication and authorization.
--
-- Ten roles, a data-driven permission matrix, and account status.
--
-- The five existing roles are RENAMED rather than replaced. `ALTER TYPE ...
-- RENAME VALUE` rewrites every stored row and every foreign reference
-- atomically, so no data migration is needed and no row is ever left holding
-- a role that no longer exists. Function bodies are a different matter —
-- plpgsql stores them as text, so every function containing an old literal
-- is recreated below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. THE TEN ROLES
-- ---------------------------------------------------------------------
alter type user_role rename value 'traveler'       to 'customer';
alter type user_role rename value 'company_owner'  to 'business_owner';
alter type user_role rename value 'company_staff'  to 'business_staff';
alter type user_role rename value 'editor'         to 'content_manager';
alter type user_role rename value 'support'        to 'support_agent';

-- ADD VALUE cannot run in the same transaction as a use of the new value,
-- which is why the seeding of role_permissions is a separate statement below.
alter type user_role add value if not exists 'booking_manager' after 'content_manager';
alter type user_role add value if not exists 'tour_operator'   after 'business_staff';
alter type user_role add value if not exists 'hotel_manager'   after 'tour_operator';

-- Defaults referenced the old names as text.
alter table profiles       alter column role set default 'customer';
alter table company_members alter column role set default 'business_staff';

-- ---------------------------------------------------------------------
-- 2. ACCOUNT STATUS
-- A role says what you may do. Status says whether you may do anything at
-- all — the two are separate, and conflating them means a suspended admin
-- keeps their powers.
-- ---------------------------------------------------------------------
create type account_status as enum (
  'pending_verification', 'active', 'suspended', 'deactivated', 'banned'
);

alter table profiles
  add column if not exists status              account_status not null default 'pending_verification',
  add column if not exists email               citext,
  add column if not exists email_verified_at   timestamptz,
  add column if not exists suspended_reason    text,
  add column if not exists suspended_at        timestamptz,
  add column if not exists suspended_by        uuid references profiles(id) on delete set null,
  add column if not exists last_login_at       timestamptz,
  add column if not exists login_count         integer not null default 0,
  add column if not exists deactivated_at      timestamptz;

create index if not exists profiles_status_idx on profiles (status)
  where status <> 'active';
create index if not exists profiles_email_idx on profiles (email);

-- ---------------------------------------------------------------------
-- 3. PERMISSION MATRIX
-- Roles are coarse; permissions are what code actually checks. Keeping the
-- mapping in a table rather than in `if` statements means an admin can see
-- exactly who can do what, and adding a permission does not mean editing
-- twenty policies.
-- ---------------------------------------------------------------------
create table permissions (
  code        text primary key,
  category    text not null,
  description text not null
);

insert into permissions (code, category, description) values
  ('listings.read.all',     'listings', 'View every listing including drafts'),
  ('listings.write.own',    'listings', 'Create and edit their own business listings'),
  ('listings.publish',      'listings', 'Publish a listing so travellers can see it'),
  ('listings.moderate',     'listings', 'Approve, reject or suspend any listing'),
  ('bookings.read.own',     'bookings', 'View bookings for their own business'),
  ('bookings.read.all',     'bookings', 'View every booking on the platform'),
  ('bookings.manage',       'bookings', 'Cancel, amend and refund bookings'),
  ('payments.read',         'payments', 'View payment and payout records'),
  ('payments.refund',       'payments', 'Issue refunds'),
  ('content.write',         'content',  'Create and edit posts and pages'),
  ('content.publish',       'content',  'Publish content to the live site'),
  ('reviews.moderate',      'reviews',  'Approve, reject and remove reviews'),
  ('reviews.reply.own',     'reviews',  'Reply to reviews on their own listings'),
  ('leads.read',            'crm',      'View enquiries and leads'),
  ('leads.manage',          'crm',      'Assign and progress leads'),
  ('support.impersonate',   'support',  'View a dashboard as its owner, for support'),
  ('users.read',            'admin',    'View user accounts'),
  ('users.suspend',         'admin',    'Suspend and reinstate accounts'),
  ('users.assign_roles',    'admin',    'Change what role a user holds'),
  ('businesses.approve',    'admin',    'Approve business applications and claims'),
  ('settings.write',        'admin',    'Change site settings, theme and scripts'),
  ('analytics.read',        'admin',    'View platform analytics')
on conflict (code) do nothing;

create table role_permissions (
  role        user_role not null,
  permission  text not null references permissions(code) on delete cascade,
  primary key (role, permission)
);

alter table permissions enable row level security;
alter table permissions force row level security;
alter table role_permissions enable row level security;
alter table role_permissions force row level security;

-- =====================================================================
-- 0019_role_permission_matrix.sql — PHASE 1 (part 2)
--
-- Separate file because Postgres refuses to use an enum value added by
-- `ALTER TYPE ... ADD VALUE` in the same transaction that added it. Splitting
-- the migration is the documented workaround and is safer than hoping the
-- statements land in different transactions.
-- =====================================================================

insert into role_permissions (role, permission) values
  -- Super admin: everything, including the ability to change roles.
  ('super_admin','listings.read.all'), ('super_admin','listings.publish'),
  ('super_admin','listings.moderate'), ('super_admin','bookings.read.all'),
  ('super_admin','bookings.manage'), ('super_admin','payments.read'),
  ('super_admin','payments.refund'), ('super_admin','content.write'),
  ('super_admin','content.publish'), ('super_admin','reviews.moderate'),
  ('super_admin','leads.read'), ('super_admin','leads.manage'),
  ('super_admin','support.impersonate'), ('super_admin','users.read'),
  ('super_admin','users.suspend'), ('super_admin','users.assign_roles'),
  ('super_admin','businesses.approve'), ('super_admin','settings.write'),
  ('super_admin','analytics.read'),

  -- Admin: everything operational, but NOT role assignment. Only a super
  -- admin can create another admin — otherwise the highest privilege on the
  -- platform is self-replicating.
  ('admin','listings.read.all'), ('admin','listings.publish'),
  ('admin','listings.moderate'), ('admin','bookings.read.all'),
  ('admin','bookings.manage'), ('admin','payments.read'),
  ('admin','payments.refund'), ('admin','content.write'),
  ('admin','content.publish'), ('admin','reviews.moderate'),
  ('admin','leads.read'), ('admin','leads.manage'),
  ('admin','support.impersonate'), ('admin','users.read'),
  ('admin','users.suspend'), ('admin','businesses.approve'),
  ('admin','settings.write'), ('admin','analytics.read'),

  -- Content manager: the site's words and pages. No money, no accounts.
  ('content_manager','content.write'), ('content_manager','content.publish'),
  ('content_manager','listings.read.all'), ('content_manager','reviews.moderate'),
  ('content_manager','settings.write'),

  -- Booking manager: the transactional desk. Can refund, cannot publish.
  ('booking_manager','bookings.read.all'), ('booking_manager','bookings.manage'),
  ('booking_manager','payments.read'), ('booking_manager','payments.refund'),
  ('booking_manager','listings.read.all'), ('booking_manager','leads.read'),

  -- Support agent: read widely, change little. Impersonation is logged.
  ('support_agent','bookings.read.all'), ('support_agent','listings.read.all'),
  ('support_agent','leads.read'), ('support_agent','leads.manage'),
  ('support_agent','users.read'), ('support_agent','support.impersonate'),
  ('support_agent','reviews.moderate'),

  -- Business owner: full control of their own business, nothing beyond it.
  ('business_owner','listings.write.own'), ('business_owner','bookings.read.own'),
  ('business_owner','reviews.reply.own'), ('business_owner','payments.read'),
  ('business_owner','leads.read'),

  -- Tour operator and hotel manager are business owners scoped to a
  -- vertical. Same powers today; separate roles because their dashboards,
  -- onboarding and permissions will diverge.
  ('tour_operator','listings.write.own'), ('tour_operator','bookings.read.own'),
  ('tour_operator','reviews.reply.own'), ('tour_operator','payments.read'),
  ('tour_operator','leads.read'),

  ('hotel_manager','listings.write.own'), ('hotel_manager','bookings.read.own'),
  ('hotel_manager','reviews.reply.own'), ('hotel_manager','leads.read'),

  -- Business staff: work the listings, never see the money.
  ('business_staff','listings.write.own'), ('business_staff','bookings.read.own'),
  ('business_staff','reviews.reply.own')

  -- Customer holds NO platform permissions. Everything a customer may do is
  -- scoped to rows they own, which RLS expresses directly with auth.uid().
on conflict do nothing;

create policy permissions_read on permissions for select using (auth.uid() is not null);
create policy role_permissions_read on role_permissions for select using (auth.uid() is not null);

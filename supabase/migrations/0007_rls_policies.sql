-- =====================================================================
-- 0007_rls_policies.sql
-- Row Level Security. The API key alone grants nothing; every read and
-- write is authorised against the caller's JWT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Authorisation helpers. security definer + stable so the planner can
-- cache them per statement instead of per row.
-- ---------------------------------------------------------------------
create or replace function auth_role()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(auth_role() in ('support','admin','super_admin','editor'), false);
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(auth_role() in ('admin','super_admin'), false);
$$;

create or replace function is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from company_members cm
    where cm.company_id = p_company_id
      and cm.profile_id = auth.uid()
      and cm.accepted_at is not null
  );
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere. Anything not covered by a policy is denied.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','authors','companies','company_members',
    'countries','country_translations','cities','city_translations','areas','area_translations',
    'points_of_interest','poi_translations','categories','category_translations',
    'tours','tour_translations','tour_categories','tour_itinerary','tour_itinerary_translations',
    'tour_faqs','tour_faq_translations','media_assets','tour_media','tour_pickup_points',
    'tour_options','tour_option_translations','tour_prices','price_rules',
    'tour_schedules','tour_departures','tour_search_index',
    'bookings','booking_items','booking_travelers','payments','payment_events','refunds',
    'coupons','coupon_redemptions','gift_cards','wallets','wallet_transactions','invoices',
    'payouts','payout_items',
    'reviews','review_media','review_votes','review_summaries',
    'wishlists','wishlist_items','saved_searches','recently_viewed','notifications',
    'cms_pages','cms_page_translations','cms_blocks','navigation_menus','navigation_items',
    'site_settings','tracking_scripts','redirects','seo_overrides',
    'blog_posts','blog_post_translations','tags','blog_post_tags','blog_post_tours',
    'ad_campaigns','ad_creatives','featured_listings','memberships','affiliate_partners',
    'audit_logs','search_queries'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- PUBLIC CATALOG — readable by anonymous visitors, written by staff.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'countries','country_translations','cities','city_translations','areas','area_translations',
    'points_of_interest','poi_translations','categories','category_translations',
    'tour_search_index','navigation_menus','navigation_items','tags','affiliate_partners','redirects'
  ]
  loop
    execute format($p$create policy "%1$s_public_read" on %1$I for select using (true)$p$, t);
    execute format($p$create policy "%1$s_staff_write" on %1$I for all
                      using (is_staff()) with check (is_staff())$p$, t);
  end loop;
end $$;

-- Tours: published rows are public; drafts belong to their company and staff.
create policy tours_public_read on tours for select
  using (status = 'published' or is_company_member(company_id) or is_staff());
create policy tours_company_write on tours for insert
  with check (is_company_member(company_id) or is_admin());
create policy tours_company_update on tours for update
  using (is_company_member(company_id) or is_staff())
  with check (is_company_member(company_id) or is_staff());
create policy tours_admin_delete on tours for delete using (is_admin());

-- Child tables inherit visibility from their parent tour.
do $$
declare t text;
begin
  foreach t in array array[
    'tour_translations','tour_categories','tour_itinerary','tour_faqs','tour_media',
    'tour_pickup_points','tour_options','tour_schedules','tour_departures'
  ]
  loop
    execute format($p$create policy "%1$s_read" on %1$I for select using (
        exists (select 1 from tours t where t.id = %1$I.tour_id
                and (t.status = 'published' or is_company_member(t.company_id) or is_staff())))$p$, t);
    execute format($p$create policy "%1$s_write" on %1$I for all using (
        exists (select 1 from tours t where t.id = %1$I.tour_id
                and (is_company_member(t.company_id) or is_staff())))
      with check (
        exists (select 1 from tours t where t.id = %1$I.tour_id
                and (is_company_member(t.company_id) or is_staff())))$p$, t);
  end loop;
end $$;

create policy tour_prices_read on tour_prices for select using (
  exists (select 1 from tour_options o join tours t on t.id = o.tour_id
          where o.id = tour_prices.option_id
            and (t.status = 'published' or is_company_member(t.company_id) or is_staff())));
create policy tour_prices_write on tour_prices for all using (
  exists (select 1 from tour_options o join tours t on t.id = o.tour_id
          where o.id = tour_prices.option_id and (is_company_member(t.company_id) or is_staff())))
  with check (
  exists (select 1 from tour_options o join tours t on t.id = o.tour_id
          where o.id = tour_prices.option_id and (is_company_member(t.company_id) or is_staff())));

create policy media_read on media_assets for select using (true);
create policy media_write on media_assets for insert with check (auth.uid() is not null);
create policy media_owner_update on media_assets for update
  using (uploaded_by = auth.uid() or is_staff());

-- ---------------------------------------------------------------------
-- IDENTITY
-- ---------------------------------------------------------------------
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_staff());
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = auth_role());
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

create policy authors_public_read on authors for select using (is_active or is_staff());
create policy authors_staff_write on authors for all using (is_staff()) with check (is_staff());

create policy companies_public_read on companies for select
  using (status = 'active' or is_company_member(id) or is_staff());
create policy companies_member_update on companies for update
  using (is_company_member(id) or is_admin())
  with check (is_company_member(id) or is_admin());
create policy companies_admin_write on companies for insert with check (auth.uid() is not null);

create policy company_members_read on company_members for select
  using (profile_id = auth.uid() or is_company_member(company_id) or is_staff());
create policy company_members_manage on company_members for all
  using (is_company_member(company_id) or is_admin())
  with check (is_company_member(company_id) or is_admin());

-- ---------------------------------------------------------------------
-- BOOKINGS — travelers see their own; suppliers see theirs; nobody else.
-- Guest bookings are read through a signed server-side lookup, never RLS.
-- ---------------------------------------------------------------------
create policy bookings_owner_read on bookings for select
  using (profile_id = auth.uid() or is_company_member(company_id) or is_staff());
create policy bookings_owner_update on bookings for update
  using (is_company_member(company_id) or is_staff())
  with check (is_company_member(company_id) or is_staff());

create policy booking_items_read on booking_items for select using (
  exists (select 1 from bookings b where b.id = booking_items.booking_id
          and (b.profile_id = auth.uid() or is_company_member(b.company_id) or is_staff())));
create policy booking_travelers_read on booking_travelers for select using (
  exists (select 1 from booking_items bi join bookings b on b.id = bi.booking_id
          where bi.id = booking_travelers.item_id
            and (b.profile_id = auth.uid() or is_company_member(b.company_id) or is_staff())));

create policy payments_read on payments for select using (
  exists (select 1 from bookings b where b.id = payments.booking_id
          and (b.profile_id = auth.uid() or is_company_member(b.company_id) or is_staff())));
create policy invoices_read on invoices for select using (
  exists (select 1 from bookings b where b.id = invoices.booking_id
          and (b.profile_id = auth.uid() or is_company_member(b.company_id) or is_staff())));
create policy refunds_read on refunds for select using (
  exists (select 1 from bookings b where b.id = refunds.booking_id
          and (b.profile_id = auth.uid() or is_company_member(b.company_id) or is_staff())));

-- Payment webhooks and booking writes run through the service role only.
create policy payment_events_admin on payment_events for all using (is_admin()) with check (is_admin());

create policy wallets_self on wallets for select using (profile_id = auth.uid() or is_staff());
create policy wallet_txn_self on wallet_transactions for select using (profile_id = auth.uid() or is_staff());
create policy gift_cards_owner on gift_cards for select
  using (purchased_by = auth.uid() or is_staff());

create policy payouts_company on payouts for select
  using (is_company_member(company_id) or is_staff());
create policy payout_items_company on payout_items for select using (
  exists (select 1 from payouts p where p.id = payout_items.payout_id
          and (is_company_member(p.company_id) or is_staff())));

create policy coupons_read on coupons for select
  using (is_active or is_company_member(company_id) or is_staff());
create policy coupons_write on coupons for all
  using (is_company_member(company_id) or is_admin())
  with check (is_company_member(company_id) or is_admin());
create policy coupon_redemptions_read on coupon_redemptions for select
  using (profile_id = auth.uid() or is_staff());

-- ---------------------------------------------------------------------
-- REVIEWS — public when published; authored only by the person who travelled.
-- ---------------------------------------------------------------------
create policy reviews_public_read on reviews for select
  using (status = 'published' or profile_id = auth.uid() or is_company_member(company_id) or is_staff());
create policy reviews_insert on reviews for insert with check (
  profile_id = auth.uid()
  and exists (
    select 1 from booking_items bi
    join bookings b on b.id = bi.booking_id
    where bi.id = reviews.booking_item_id
      and b.profile_id = auth.uid()
      and b.status in ('confirmed','completed')
      and bi.starts_at < now()
  ));
create policy reviews_author_update on reviews for update
  using (profile_id = auth.uid() and status <> 'published')
  with check (profile_id = auth.uid());
create policy reviews_staff_moderate on reviews for update using (is_staff()) with check (is_staff());

create policy review_media_read on review_media for select using (true);
create policy review_votes_self on review_votes for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy review_summaries_read on review_summaries for select using (true);

-- ---------------------------------------------------------------------
-- PERSONAL DATA — strictly owner-scoped.
-- ---------------------------------------------------------------------
create policy wishlists_owner on wishlists for all
  using (profile_id = auth.uid() or is_public) with check (profile_id = auth.uid());
create policy wishlist_items_owner on wishlist_items for all using (
  exists (select 1 from wishlists w where w.id = wishlist_items.wishlist_id
          and (w.profile_id = auth.uid() or w.is_public)))
  with check (exists (select 1 from wishlists w where w.id = wishlist_items.wishlist_id and w.profile_id = auth.uid()));
create policy saved_searches_owner on saved_searches for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy recently_viewed_owner on recently_viewed for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notifications_owner on notifications for select using (profile_id = auth.uid());
create policy notifications_owner_update on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- CONTENT & MONETIZATION
-- ---------------------------------------------------------------------
create policy cms_pages_read on cms_pages for select using (status = 'published' or is_staff());
create policy cms_pages_write on cms_pages for all using (is_staff()) with check (is_staff());
create policy cms_page_tr_read on cms_page_translations for select using (
  exists (select 1 from cms_pages p where p.id = cms_page_translations.page_id
          and (p.status = 'published' or is_staff())));
create policy cms_page_tr_write on cms_page_translations for all using (is_staff()) with check (is_staff());
create policy cms_blocks_read on cms_blocks for select using (
  is_visible and exists (select 1 from cms_pages p where p.id = cms_blocks.page_id
                         and (p.status = 'published' or is_staff())));
create policy cms_blocks_write on cms_blocks for all using (is_staff()) with check (is_staff());

create policy blog_read on blog_posts for select using (status = 'published' or is_staff());
create policy blog_write on blog_posts for all using (is_staff()) with check (is_staff());
create policy blog_tr_read on blog_post_translations for select using (
  exists (select 1 from blog_posts p where p.id = blog_post_translations.post_id
          and (p.status = 'published' or is_staff())));
create policy blog_tr_write on blog_post_translations for all using (is_staff()) with check (is_staff());
create policy blog_tags_read on blog_post_tags for select using (true);
create policy blog_tours_read on blog_post_tours for select using (true);

create policy seo_overrides_read on seo_overrides for select using (true);
create policy seo_overrides_write on seo_overrides for all using (is_staff()) with check (is_staff());
create policy site_settings_read on site_settings for select using (true);
create policy site_settings_write on site_settings for all using (is_admin()) with check (is_admin());
create policy tracking_read on tracking_scripts for select using (is_active or is_admin());
create policy tracking_write on tracking_scripts for all using (is_admin()) with check (is_admin());

create policy ad_campaigns_read on ad_campaigns for select
  using (is_active or is_company_member(advertiser_company_id) or is_staff());
create policy ad_campaigns_write on ad_campaigns for all using (is_admin()) with check (is_admin());
create policy ad_creatives_read on ad_creatives for select using (is_active or is_staff());
create policy ad_creatives_write on ad_creatives for all using (is_admin()) with check (is_admin());
create policy featured_read on featured_listings for select using (is_active or is_staff());
create policy featured_write on featured_listings for all using (is_admin()) with check (is_admin());
create policy memberships_read on memberships for select
  using (is_company_member(company_id) or is_staff());
create policy memberships_write on memberships for all using (is_admin()) with check (is_admin());

create policy audit_read on audit_logs for select using (is_admin());
create policy search_queries_insert on search_queries for insert with check (true);
create policy search_queries_read on search_queries for select using (is_staff());

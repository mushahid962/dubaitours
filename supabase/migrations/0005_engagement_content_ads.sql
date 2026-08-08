-- =====================================================================
-- 0005_engagement_content_ads.sql
-- Reviews, traveler engagement, CMS, blog, monetization and audit trail.
-- =====================================================================

-- ---------------------------------------------------------------------
-- REVIEWS — only bookings that happened can be reviewed (verified badge).
-- ---------------------------------------------------------------------
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid not null references tours(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null,
  booking_item_id uuid references booking_items(id) on delete set null,
  status        review_status not null default 'pending',
  rating        smallint not null check (rating between 1 and 5),
  rating_value  smallint check (rating_value between 1 and 5),
  rating_guide  smallint check (rating_guide between 1 and 5),
  rating_safety smallint check (rating_safety between 1 and 5),
  title         text,
  body          text,
  locale        locale_code not null default 'en',
  traveler_type text check (traveler_type in ('solo','couple','family','friends','business')),
  travelled_on  date,
  helpful_count integer not null default 0,
  supplier_reply text,
  supplier_replied_at timestamptz,
  moderated_by  uuid references profiles(id) on delete set null,
  moderation_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index reviews_one_per_item_uq on reviews (booking_item_id) where booking_item_id is not null;
create index reviews_tour_idx on reviews (tour_id, created_at desc) where status = 'published';
create index reviews_rating_idx on reviews (tour_id, rating) where status = 'published';

create table review_media (
  review_id uuid not null references reviews(id) on delete cascade,
  media_id  uuid not null references media_assets(id) on delete cascade,
  position  smallint not null default 0,
  primary key (review_id, media_id)
);

create table review_votes (
  review_id  uuid not null references reviews(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (review_id, profile_id)
);

-- AI-generated digest of a tour's reviews; regenerated when count crosses a threshold.
create table review_summaries (
  tour_id       uuid not null references tours(id) on delete cascade,
  locale        locale_code not null,
  summary       text not null,
  pros          text[] not null default '{}',
  cons          text[] not null default '{}',
  source_count  integer not null,
  model         text not null,
  generated_at  timestamptz not null default now(),
  primary key (tour_id, locale)
);

-- ---------------------------------------------------------------------
-- TRAVELER ENGAGEMENT
-- ---------------------------------------------------------------------
create table wishlists (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  name        text not null default 'My wishlist',
  is_public   boolean not null default false,
  share_slug  text unique,
  created_at  timestamptz not null default now()
);

create table wishlist_items (
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  tour_id     uuid not null references tours(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (wishlist_id, tour_id)
);

create table saved_searches (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  label       text not null,
  query       jsonb not null,           -- serialised filter state
  alert_freq  text not null default 'none' check (alert_freq in ('none','daily','weekly')),
  last_alerted_at timestamptz,
  created_at  timestamptz not null default now()
);

create table recently_viewed (
  profile_id uuid not null references profiles(id) on delete cascade,
  tour_id    uuid not null references tours(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (profile_id, tour_id)
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  channel     text not null default 'in_app' check (channel in ('in_app','email','push','sms','whatsapp')),
  topic       text not null,
  title       text not null,
  body        text,
  action_url  text,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_unread_idx on notifications (profile_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------
-- CMS — every surface editable without a deploy.
-- ---------------------------------------------------------------------
create table cms_pages (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,      -- 'home', 'about', 'partner-landing'
  template     text not null default 'flexible',
  status       content_status not null default 'draft',
  published_at timestamptz,
  updated_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table cms_page_translations (
  page_id          uuid not null references cms_pages(id) on delete cascade,
  locale           locale_code not null,
  title            text not null,
  slug             text not null,
  meta_title       text,
  meta_description text,
  og_image_url     text,
  primary key (page_id, locale)
);
create unique index cms_page_slug_uq on cms_page_translations (locale, slug);

create table cms_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references cms_pages(id) on delete cascade,
  position   smallint not null,
  block_type text not null,               -- 'hero', 'tour_rail', 'city_grid', 'faq', 'ad_slot'
  settings   jsonb not null default '{}'::jsonb,
  content    jsonb not null default '{}'::jsonb,   -- keyed by locale
  is_visible boolean not null default true,
  unique (page_id, position)
);

create table navigation_menus (
  id       uuid primary key default gen_random_uuid(),
  key      text not null unique,          -- 'header_main', 'footer_col_1'
  is_active boolean not null default true
);

create table navigation_items (
  id         uuid primary key default gen_random_uuid(),
  menu_id    uuid not null references navigation_menus(id) on delete cascade,
  parent_id  uuid references navigation_items(id) on delete cascade,
  position   smallint not null default 0,
  href       text not null,
  labels     jsonb not null default '{}'::jsonb,  -- {"en":"Things to do","ar":"..."}
  icon       text,
  badge      text,
  rel        text,
  is_visible boolean not null default true
);

create table site_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Third-party scripts and pixels, injected by placement with consent gating.
create table tracking_scripts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  placement   text not null check (placement in ('head','body_start','body_end')),
  consent_category text not null default 'analytics' check (consent_category in ('necessary','analytics','marketing')),
  script      text not null,
  countries   char(2)[] not null default '{}',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text not null unique,
  to_path     text not null,
  status_code smallint not null default 301 check (status_code in (301,302,307,308)),
  hits        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Per-URL SEO overrides for any entity, editable by the SEO team.
create table seo_overrides (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null check (entity_type in ('tour','city','country','category','page','post','company')),
  entity_id        uuid not null,
  locale           locale_code not null,
  meta_title       text,
  meta_description text,
  canonical_url    text,
  robots           text,                 -- 'index,follow' | 'noindex,follow'
  og_image_url     text,
  faq_jsonld       jsonb,
  updated_by       uuid references profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (entity_type, entity_id, locale)
);

-- ---------------------------------------------------------------------
-- BLOG / TRAVEL MAGAZINE
-- ---------------------------------------------------------------------
create table blog_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references authors(id) on delete restrict,
  reviewer_id   uuid references authors(id) on delete set null,   -- EEAT: reviewed by
  status        content_status not null default 'draft',
  post_type     text not null default 'guide' check (post_type in ('guide','listicle','news','itinerary','food','culture','visa','event','review')),
  city_id       uuid references cities(id) on delete set null,
  country_id    uuid references countries(id) on delete set null,
  category_id   uuid references categories(id) on delete set null,
  cover_media_id uuid references media_assets(id) on delete set null,
  reading_minutes smallint,
  view_count    integer not null default 0,
  published_at  timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index blog_posts_published_idx on blog_posts (published_at desc) where status = 'published';

create table blog_post_translations (
  post_id          uuid not null references blog_posts(id) on delete cascade,
  locale           locale_code not null,
  title            text not null,
  slug             text not null,
  excerpt          text,
  body_mdx         text not null,
  meta_title       text,
  meta_description text,
  primary key (post_id, locale)
);
create unique index blog_slug_uq on blog_post_translations (locale, slug);

create table tags (
  id     uuid primary key default gen_random_uuid(),
  slug   text not null unique,
  labels jsonb not null default '{}'::jsonb
);

create table blog_post_tags (
  post_id uuid not null references blog_posts(id) on delete cascade,
  tag_id  uuid not null references tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table blog_post_tours (
  post_id  uuid not null references blog_posts(id) on delete cascade,
  tour_id  uuid not null references tours(id) on delete cascade,
  position smallint not null default 0,
  primary key (post_id, tour_id)
);

-- ---------------------------------------------------------------------
-- MONETIZATION — house ad server, featured slots, memberships.
-- ---------------------------------------------------------------------
create table ad_campaigns (
  id            uuid primary key default gen_random_uuid(),
  advertiser_company_id uuid references companies(id) on delete cascade,
  advertiser_name text not null,
  pricing_model ad_pricing_model not null default 'cpm',
  rate          numeric(12,2) not null,
  currency      currency_code not null default 'AED',
  budget_total  numeric(12,2),
  budget_spent  numeric(12,2) not null default 0,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint campaign_window check (ends_at > starts_at)
);

create table ad_creatives (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references ad_campaigns(id) on delete cascade,
  placement    ad_placement not null,
  format       text not null check (format in ('banner','native','video','popup','interstitial')),
  media_id     uuid references media_assets(id) on delete set null,
  headline     jsonb not null default '{}'::jsonb,
  body         jsonb not null default '{}'::jsonb,
  cta_label    jsonb not null default '{}'::jsonb,
  target_url   text not null,
  weight       smallint not null default 1,
  -- Targeting
  target_countries char(2)[] not null default '{}',
  target_city_ids  uuid[] not null default '{}',
  target_category_ids uuid[] not null default '{}',
  target_locales   locale_code[] not null default '{}',
  target_devices   text[] not null default '{}',
  frequency_cap_per_day smallint,
  is_active    boolean not null default true
);
create index ad_creatives_serving_idx on ad_creatives (placement) where is_active;

-- Impressions land in a partitioned table: high write volume, cheap pruning.
create table ad_impressions (
  id          bigint generated always as identity,
  creative_id uuid not null references ad_creatives(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  session_id  text,
  country     char(2),
  city_id     uuid,
  device      text,
  locale      locale_code,
  is_click    boolean not null default false,
  revenue     numeric(12,4) not null default 0,
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table ad_impressions_2026m08 partition of ad_impressions
  for values from ('2026-08-01') to ('2026-09-01');
create table ad_impressions_2026m09 partition of ad_impressions
  for values from ('2026-09-01') to ('2026-10-01');

create table featured_listings (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid references tours(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  slot        feature_slot not null,
  city_id     uuid references cities(id) on delete cascade,
  country_id  uuid references countries(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  position    smallint not null default 0,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  price_paid  numeric(12,2) not null default 0,
  currency    currency_code not null default 'AED',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint featured_target check (tour_id is not null or company_id is not null),
  constraint featured_window check (ends_at > starts_at)
);
create index featured_serving_idx on featured_listings (slot, starts_at, ends_at) where is_active;

create table memberships (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  plan         text not null check (plan in ('free','growth','pro','enterprise')),
  status       text not null default 'active' check (status in ('trialing','active','past_due','cancelled')),
  price        numeric(12,2) not null default 0,
  currency     currency_code not null default 'AED',
  interval     text not null default 'month' check (interval in ('month','year')),
  benefits     jsonb not null default '{}'::jsonb,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at   timestamptz not null default now()
);
create unique index memberships_active_uq on memberships (company_id) where status in ('trialing','active');

create table affiliate_partners (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  vertical     text not null check (vertical in ('hotels','flights','insurance','visa','transfers','car_rental','esim')),
  base_url     text not null,
  param_map    jsonb not null default '{}'::jsonb,
  commission_note text,
  is_active    boolean not null default true
);

-- ---------------------------------------------------------------------
-- OBSERVABILITY
-- ---------------------------------------------------------------------
create table audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references profiles(id) on delete set null,
  actor_role  user_role,
  action      text not null,               -- 'tour.publish', 'booking.refund'
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index audit_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

create table search_queries (
  id          bigint generated always as identity primary key,
  query       text not null,
  locale      locale_code not null default 'en',
  city_id     uuid references cities(id) on delete set null,
  results_count integer not null default 0,
  clicked_tour_id uuid references tours(id) on delete set null,
  session_id  text,
  created_at  timestamptz not null default now()
);
create index search_queries_trgm_idx on search_queries using gin (query gin_trgm_ops);

create trigger touch_reviews before update on reviews for each row execute function internal.touch_updated_at();
create trigger touch_cms_pages before update on cms_pages for each row execute function internal.touch_updated_at();

-- =====================================================================
-- CATCH-UP — business categories (migration 0024).
--
-- Run this if your database already has 0001–0023. Then re-run
-- part-3-seed.sql to load the 15 categories and their subcategories.
--
-- Adds: business_categories (two-level tree), listing_categories,
-- city_category_counts, and resolve_directory_path() — the function the
-- router uses to turn /uae/dubai/tours/dune-buggy into an entity.
-- =====================================================================

-- =====================================================================
-- 0024_business_categories.sql — the category spine for the directory.
--
-- URL DECISION
--
--   canonical   /{country}/{city}/{category}/{subcategory?}/{slug?}
--   short form  /{city}/{category}            → 301 to the canonical
--
-- Both were in the brief. Serving both without a redirect would split every
-- ranking signal between two URLs for the same page, which is the single most
-- common self-inflicted SEO wound. The country prefix wins because it scales
-- to six countries without slug collisions ("Al Khor" exists in Qatar and
-- Saudi Arabia) and reads as a hierarchy to both crawlers and people.
--
-- `business_categories` is a two-level tree — Tours → Dune Buggy — and maps
-- onto the verticals from 0015. A vertical is HOW a thing is fulfilled
-- (booking, enquiry, info). A category is WHAT it is. A yacht company and a
-- desert operator are different categories inside one bookable vertical.
-- =====================================================================

create table business_categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references business_categories(id) on delete restrict,
  vertical_id   uuid references verticals(id) on delete set null,
  code          text not null unique,
  icon          text,
  -- Directory listing vs. sellable product. A mall is a place; a dune buggy
  -- session is a thing you book. The card, the page and the call to action
  -- all differ, so the distinction is stored rather than inferred.
  kind          text not null default 'business'
                check (kind in ('business', 'activity', 'place')),
  depth         smallint not null default 0,
  display_order smallint not null default 0,
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index business_categories_parent_idx on business_categories (parent_id, display_order);
create index business_categories_vertical_idx on business_categories (vertical_id) where is_active;

create table business_category_translations (
  category_id      uuid not null references business_categories(id) on delete cascade,
  locale           locale_code not null,
  name             text not null,
  slug             text not null,
  plural           text,
  h1               text,
  intro            text,
  body             text,
  meta_title       text,
  meta_description text,
  primary key (category_id, locale)
);

-- Unique per PARENT, not globally: /dubai/tours/yacht-tours and
-- /dubai/cruises/yacht-charter can both exist without clashing, while two
-- children of Tours cannot both be "yacht-tours".
create unique index business_category_slug_uq
  on business_category_translations (locale, slug, category_id);
-- Top-level slugs must be globally unique, because /{city}/{slug} has no
-- parent segment to disambiguate them. A partial index cannot express this
-- (index predicates may not contain subqueries), so a trigger does.
create or replace function internal.guard_root_category_slug()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from business_categories where id = new.category_id and parent_id is null)
     and exists (
       select 1 from business_category_translations t
       join business_categories c on c.id = t.category_id
       where t.locale = new.locale and t.slug = new.slug
         and t.category_id <> new.category_id and c.parent_id is null
     )
  then
    raise exception 'The top-level category slug "%" is already taken. Top-level slugs must be unique because /{city}/{slug} has nothing else to distinguish them.', new.slug
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger guard_root_category_slug
  before insert or update of slug on business_category_translations
  for each row execute function internal.guard_root_category_slug();

-- ---------------------------------------------------------------------
-- LISTING ↔ CATEGORY
-- Many-to-many: a desert camp is both "Desert Safari" and "Camel Rides".
-- ---------------------------------------------------------------------
create table listing_categories (
  listing_id  uuid not null references listings(id) on delete cascade,
  category_id uuid not null references business_categories(id) on delete cascade,
  is_primary  boolean not null default false,
  primary key (listing_id, category_id)
);
create index listing_categories_category_idx on listing_categories (category_id);
create unique index listing_one_primary_category
  on listing_categories (listing_id) where is_primary;

-- ---------------------------------------------------------------------
-- CITY × CATEGORY COUNTS
-- The navigation shows "Dune Buggy (14)", and the indexation gate needs the
-- same number. Counting per request would mean a scan per menu item.
-- ---------------------------------------------------------------------
create table city_category_counts (
  city_id       uuid not null references cities(id) on delete cascade,
  category_id   uuid not null references business_categories(id) on delete cascade,
  listing_count integer not null default 0,
  min_price     numeric(12,2),
  max_price     numeric(12,2),
  currency      currency_code,
  updated_at    timestamptz not null default now(),
  primary key (city_id, category_id)
);
create index city_category_counts_idx on city_category_counts (city_id, listing_count desc);

create or replace function refresh_city_category_counts()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_rows integer;
begin
  delete from city_category_counts;

  insert into city_category_counts (city_id, category_id, listing_count, min_price, max_price, currency)
  select l.city_id, lc.category_id, count(*),
         min(l.price_from), max(l.price_from), min(l.currency)
  from listings l
  join listing_categories lc on lc.listing_id = l.id
  where l.status = 'published'
  group by l.city_id, lc.category_id;

  -- A parent category shows the sum of its children, so "Tours (37)" is the
  -- whole section rather than only listings tagged with the parent itself.
  insert into city_category_counts (city_id, category_id, listing_count, min_price, max_price, currency)
  select c.city_id, parent.id, sum(c.listing_count),
         min(c.min_price), max(c.max_price), min(c.currency)
  from city_category_counts c
  join business_categories child on child.id = c.category_id
  join business_categories parent on parent.id = child.parent_id
  group by c.city_id, parent.id
  on conflict (city_id, category_id) do update
    set listing_count = city_category_counts.listing_count + excluded.listing_count,
        min_price = least(city_category_counts.min_price, excluded.min_price),
        max_price = greatest(city_category_counts.max_price, excluded.max_price);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------
-- RESOLVER
-- One function the router calls to turn a URL into an entity, so the routing
-- rules live in one place rather than being re-derived per page.
-- ---------------------------------------------------------------------
create or replace function resolve_directory_path(
  p_country text, p_city text, p_category text default null,
  p_sub text default null, p_locale locale_code default 'en'
)
returns table (
  city_id uuid, city_name text, country_id uuid, country_name text,
  category_id uuid, category_name text, category_kind text,
  sub_id uuid, sub_name text, listing_count integer
)
language sql stable
as $$
  with city as (
    select ci.id, ct.name, ci.country_id
    from cities ci
    join city_translations ct on ct.city_id = ci.id and ct.locale = p_locale
    join countries co on co.id = ci.country_id
    join country_translations cot on cot.country_id = co.id and cot.locale = p_locale
    where ct.slug = p_city and cot.slug = p_country
    limit 1
  ),
  cat as (
    select bc.id, bt.name, bc.kind
    from business_categories bc
    join business_category_translations bt on bt.category_id = bc.id and bt.locale = p_locale
    where bt.slug = p_category and bc.parent_id is null and bc.is_active
    limit 1
  ),
  sub as (
    select bc.id, bt.name
    from business_categories bc
    join business_category_translations bt on bt.category_id = bc.id and bt.locale = p_locale
    where bt.slug = p_sub and bc.parent_id = (select id from cat) and bc.is_active
    limit 1
  )
  select city.id, city.name, co.id, cot.name,
         cat.id, cat.name, cat.kind,
         sub.id, sub.name,
         coalesce((select cc.listing_count from city_category_counts cc
                   where cc.city_id = city.id
                     and cc.category_id = coalesce(sub.id, cat.id)), 0)
  from city
  join countries co on co.id = city.country_id
  join country_translations cot on cot.country_id = co.id and cot.locale = p_locale
  left join cat on true
  left join sub on true;
$$;

alter table business_categories enable row level security;
alter table business_category_translations enable row level security;
alter table listing_categories enable row level security;
alter table city_category_counts enable row level security;

create policy bc_read on business_categories for select using (is_active or is_staff());
create policy bc_write on business_categories for all
  using (has_permission('settings.write')) with check (has_permission('settings.write'));
create policy bct_read on business_category_translations for select using (true);
create policy bct_write on business_category_translations for all
  using (has_permission('settings.write')) with check (has_permission('settings.write'));
create policy lc_read on listing_categories for select using (true);
create policy lc_write on listing_categories for all
  using (is_staff()) with check (is_staff());
create policy ccc_read on city_category_counts for select using (true);

grant select on business_categories, business_category_translations,
                listing_categories, city_category_counts to anon, authenticated;

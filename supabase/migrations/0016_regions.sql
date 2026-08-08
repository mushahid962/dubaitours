-- =====================================================================
-- 0016_regions.sql — PHASE 2 (part 1): the missing hierarchy level.
--
-- Dubai is both an emirate and a city. Abu Dhabi emirate contains Al Ain.
-- Without a region layer there is no way to express "everything in Sharjah
-- emirate", and no URL for it. Retrofitting a hierarchy level after the URLs
-- are indexed means rewriting every one of them, so it goes in now.
--
--   country → region → city → area → listing
-- =====================================================================

create table regions (
  id          uuid primary key default gen_random_uuid(),
  country_id  uuid not null references countries(id) on delete restrict,
  code        text,                          -- 'AE-DU', 'SA-01'
  kind        text not null default 'emirate'
              check (kind in ('emirate', 'province', 'governorate', 'region', 'municipality')),
  centroid    geography(point, 4326),
  is_active   boolean not null default true,
  priority    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (country_id, code)
);
create index regions_country_idx on regions (country_id) where is_active;

create table region_translations (
  region_id        uuid not null references regions(id) on delete cascade,
  locale           locale_code not null,
  name             text not null,
  slug             text not null,
  tagline          text,
  intro            text,
  body             text,
  meta_title       text,
  meta_description text,
  primary key (region_id, locale)
);
create unique index region_slug_uq on region_translations (locale, slug);

alter table cities add column if not exists region_id uuid references regions(id) on delete set null;
create index if not exists cities_region_idx on cities (region_id);

create trigger touch_regions before update on regions
  for each row execute function internal.touch_updated_at();

alter table regions enable row level security;
alter table regions force row level security;
alter table region_translations enable row level security;
alter table region_translations force row level security;

create policy regions_public_read on regions for select using (true);
create policy regions_staff_write on regions for all using (is_staff()) with check (is_staff());
create policy region_tr_public_read on region_translations for select using (true);
create policy region_tr_staff_write on region_translations for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- No data here on purpose.
--
-- The region backfill needs countries and cities to exist, and migrations run
-- before the seed. Data belongs in supabase/seed/seed.sql, which is where the
-- emirates and the city→region mapping now live.
-- ---------------------------------------------------------------------

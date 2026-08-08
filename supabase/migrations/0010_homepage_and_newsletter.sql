-- =====================================================================
-- 0010_homepage_and_newsletter.sql
--
-- Supports a data-driven homepage: newsletter capture, popular search
-- suggestions, and a cached stats snapshot so the homepage never runs
-- count(*) across the catalogue on every request.
-- =====================================================================

create table newsletter_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  locale        locale_code not null default 'en',
  country_id    uuid references countries(id) on delete set null,
  source        text not null default 'homepage',
  -- Double opt-in is not optional in most GCC markets, and a list built
  -- without it gets your sending domain blocked.
  confirmed_at  timestamptz,
  confirm_token text not null default encode(gen_random_bytes(24), 'hex'),
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now()
);
create index newsletter_pending_idx on newsletter_subscribers (created_at)
  where confirmed_at is null and unsubscribed_at is null;

-- Editorially curated search suggestions, shown under the hero. Seeded by
-- hand at launch, later informed by `search_queries`.
create table popular_searches (
  id         uuid primary key default gen_random_uuid(),
  locale     locale_code not null,
  label      text not null,
  href       text not null,
  position   smallint not null default 0,
  is_active  boolean not null default true,
  unique (locale, label)
);

-- Homepage counters. Recomputing these per request means several count(*)
-- scans on the hottest page on the site; refreshed by cron instead.
create materialized view homepage_stats as
select
  (select count(*) from tours where status = 'published')                    as tour_count,
  (select count(*) from companies where status = 'active')                   as operator_count,
  (select count(*) from cities where is_active)                              as city_count,
  (select count(*) from countries where is_launched)                         as country_count,
  (select count(*) from reviews where status = 'published')                  as review_count,
  (select coalesce(round(avg(rating), 2), 0) from reviews where status = 'published') as rating_avg,
  now()                                                                       as refreshed_at;

create unique index homepage_stats_uq on homepage_stats ((true));

-- Non-concurrent on purpose. REFRESH ... CONCURRENTLY cannot run inside a
-- function body, and this view is a single row of counts — the refresh takes
-- milliseconds, so the brief exclusive lock is cheaper than the complexity of
-- calling it outside a transaction. If the counts ever get slow, move the
-- CONCURRENTLY refresh into the cron route instead of this function.
create or replace function refresh_homepage_stats()
returns void
language sql
security definer set search_path = public
as $$
  refresh materialized view homepage_stats;
$$;

alter table newsletter_subscribers enable row level security;
alter table newsletter_subscribers force row level security;
alter table popular_searches enable row level security;
alter table popular_searches force row level security;

-- Anyone may subscribe; nobody may read the list except staff. A publicly
-- readable subscriber table is a harvestable email list.
create policy newsletter_insert on newsletter_subscribers for insert with check (true);
create policy newsletter_staff_read on newsletter_subscribers for select using (is_staff());
create policy newsletter_staff_write on newsletter_subscribers for update using (is_staff()) with check (is_staff());

create policy popular_searches_read on popular_searches for select using (is_active);
create policy popular_searches_write on popular_searches for all using (is_staff()) with check (is_staff());

grant select on homepage_stats to anon, authenticated;

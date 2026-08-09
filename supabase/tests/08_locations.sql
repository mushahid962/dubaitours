-- =====================================================================
-- 08_locations.sql — PHASE 2: hierarchy, slugs and the indexation gate.
-- =====================================================================
\set ON_ERROR_STOP on

\echo '=== 1. Six levels, one table ==='
select level, count(*), min(depth) as depth from locations group by level order by 3;

\echo ''
\echo '=== 2. Breadcrumbs from any depth, in one query ==='
select id as jbr from locations where subpath(path, -1)::text = 'jbr' \gset
select depth, level, name, slug from location_ancestors(:'jbr');

\echo ''
\echo '=== 3. Everything beneath a country, filtered by level ==='
select id as uae from locations where level = 'country' and country_code = 'AE' \gset
select level, count(*) from location_descendants(:'uae') group by level order by 2 desc;

\echo ''
\echo '--- Qatar cities, as requested ---'
select name, slug from location_descendants(
  (select id from locations where level='country' and country_code='QA'), 'city'
) order by name;

\echo ''
\echo '=== 4. Slugs are globally unique per locale ==='
do $$
declare v_target uuid;
begin
  select id into v_target from locations where level = 'district' limit 1;
  update location_translations set slug = 'dubai' where location_id = v_target and locale = 'en';
  raise exception 'DUPLICATE SLUG ALLOWED - /destinations/{slug} would be ambiguous';
exception when unique_violation then
  raise notice 'duplicate slug blocked: /destinations/{slug} always resolves to one place';
end $$;

\echo ''
\echo '=== 5. Renaming a slug moves the whole subtree ==='
select path as marina_path_before from locations
where subpath(path, -1)::text = 'dubai_marina' \gset
update location_translations set slug = 'marina-district'
where location_id = (select id from locations where subpath(path,-1)::text='dubai_marina')
  and locale = 'en';
select l.path as jbr_path_after
from locations l where subpath(l.path, -1)::text = 'jbr';

\echo ''
\echo '=== 6. Indexation gate: only meaningful pages ==='
select
  level,
  count(*) filter (where should_index) as indexed,
  count(*) filter (where not should_index) as noindexed
from location_pages where locale = 'en' group by level order by 2 desc;

\echo ''
\echo '--- An empty district with no copy is NOT indexed ---'
insert into locations (parent_id, level, path, country_code, timezone, status)
select id, 'district', path || 'empty_test'::ltree, country_code, timezone, 'published'
from locations where level = 'city' limit 1;
insert into location_translations (location_id, locale, name, slug)
select id, 'en', 'Empty Test District', 'empty-test-district'
from locations where subpath(path,-1)::text = 'empty_test';
select name, listing_count, should_index from location_pages
where locale = 'en' and slug = 'empty-test-district';

\echo ''
\echo '--- Give it 250+ words of real copy and it earns indexation ---'
update location_translations
   set intro = repeat('This district has genuine editorial content describing what is here, why someone would come, and what to expect when they do. ', 6)
 where slug = 'empty-test-district';
select name, length(intro) as intro_chars, should_index from location_pages
where locale = 'en' and slug = 'empty-test-district';

\echo ''
\echo '=== 7. Counts roll up from descendants ==='
select refresh_location_counts();
select lt.name, l.level, l.listing_count
from locations l join location_translations lt on lt.location_id = l.id and lt.locale = 'en'
where l.listing_count > 0 order by l.listing_count desc, l.depth limit 8;

\echo ''
\echo '=== 8. A country cannot have a parent; a district must ==='
do $$ begin
  insert into locations (parent_id, level, path, country_code)
  values ((select id from locations where level='city' limit 1), 'country', 'bad_country'::ltree, 'XX');
  raise exception 'ROOT WITH PARENT ALLOWED';
exception when check_violation then raise notice 'a country cannot sit under another location';
end $$;

do $$ begin
  insert into locations (level, path, country_code) values ('district', 'orphan'::ltree, 'AE');
  raise exception 'ORPHAN DISTRICT ALLOWED';
exception when check_violation then raise notice 'a district cannot exist without a parent';
end $$;

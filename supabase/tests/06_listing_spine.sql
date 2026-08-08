-- =====================================================================
-- 06_listing_spine.sql — the URL namespace guard and the spine invariants.
-- =====================================================================
\set ON_ERROR_STOP on

\echo '=== 1. Every tour and place appears in ONE listing index ==='
select vertical_slug, count(*) from listing_index where locale = 'en'
group by vertical_slug order by 1;

\echo ''
\echo '=== 2. A listing slug cannot collide with a category slug ==='
-- 'desert-safari' is a category. A listing must not be able to claim it,
-- because both occupy the same URL segment.
-- Same locale as the category, because slugs are namespaced per locale:
-- /hi/.../desert-safari and /en/.../desert-safari are different URLs and do
-- not collide. The real risk is a listing claiming an English category slug.
do $$
declare v_listing uuid;
begin
  select id into v_listing from listings limit 1;
  update listing_translations set slug = 'desert-safari'
  where listing_id = v_listing and locale = 'en';
  raise exception 'COLLISION ALLOWED - the URL namespace is not protected';
exception when unique_violation then
  raise notice 'category/listing slug collision blocked';
end $$;

\echo ''
\echo '=== 3. A listing cannot be both a tour and a place ==='
do $$
begin
  insert into listings (vertical_id, country_id, city_id, tour_id, poi_id)
  select (select id from verticals limit 1), (select id from countries limit 1),
         (select id from cities limit 1), (select id from tours limit 1),
         (select id from points_of_interest limit 1);
  raise exception 'DUAL-SOURCE LISTING ALLOWED';
exception when check_violation then
  raise notice 'a listing cannot have both a tour and a place attached';
end $$;

\echo ''
\echo '=== 4. Editing a tour flows through to its listing ==='
update tour_translations set title = 'Renamed Desert Safari'
where locale = 'en' and slug = 'dubai-evening-desert-safari-bbq';
update tours set from_price = 199 where status = 'published';
select name, price_from from listing_index
where locale = 'en' and vertical_slug = 'tours';

\echo ''
\echo '=== 5. Fulfilment resolves per vertical, overridable per listing ==='
select vertical_slug, fulfilment, count(*)
from listing_index where locale = 'en' group by 1, 2 order by 1;

update listings set fulfilment = 'booking'
where poi_id = (select id from points_of_interest where kind = 'hotel' limit 1);
select name, fulfilment from listing_index
where locale = 'en' and vertical_slug = 'hotels' order by name;

\echo ''
\echo '=== 6. Region hierarchy is complete ==='
select count(*) filter (where region_id is null) as listings_without_region,
       count(*) as total
from listings;

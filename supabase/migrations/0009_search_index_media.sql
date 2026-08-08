-- =====================================================================
-- 0009_search_index_media.sql
--
-- Listing pages render a card per tour, and every card needs a cover image.
-- Without it in the index, a 24-result page becomes 24 extra queries. The
-- image columns are denormalised here and maintained by reindex_tour(),
-- which already runs on every publish and every edit.
-- =====================================================================

alter table tour_search_index
  add column cover_url      text,
  add column cover_alt      text,
  add column cover_blurhash text,
  add column cover_width    integer,
  add column cover_height   integer,
  add column cancellation   cancellation_policy,
  add column min_age        smallint;

-- Rebuilt to include the cover. Same signature, so every existing trigger
-- keeps working untouched.
create or replace function internal.reindex_tour(p_tour_id uuid)
returns void
language plpgsql
security definer set search_path = public, internal
as $$
begin
  delete from tour_search_index where tour_id = p_tour_id;

  insert into tour_search_index (
    tour_id, locale, title, slug, summary, city_id, city_name, country_id, country_name,
    company_id, company_name, category_ids, category_names, tour_type, confirmation,
    day_parts, guide_locales, duration_minutes, from_price, currency, discount_pct,
    rating_avg, rating_count, popularity_score, pickup_included, family_friendly,
    is_luxury, is_private, location, document,
    cover_url, cover_alt, cover_blurhash, cover_width, cover_height,
    cancellation, min_age
  )
  select
    t.id,
    tt.locale,
    tt.title,
    tt.slug,
    tt.summary,
    t.city_id, ct.name,
    c.id, cot.name,
    t.company_id, comp.display_name,
    coalesce(cats.ids, '{}'::uuid[]),
    coalesce(cats.names, '{}'::text[]),
    t.tour_type, t.confirmation, t.day_parts, t.guide_locales,
    t.duration_minutes, t.from_price, t.base_currency, t.discount_pct,
    t.rating_avg, t.rating_count, t.popularity_score,
    t.pickup_included, t.family_friendly, t.is_luxury, t.is_private,
    coalesce(t.meeting_point, ci.centroid),
    setweight(to_tsvector('simple', coalesce(tt.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(ct.name, '') || ' ' || coalesce(cot.name, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(cats.names, '{}'::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(tt.summary, '')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(tt.highlights, ' ')), 'D'),
    cover.url,
    -- Alt text falls back to a description built from real data. An empty alt
    -- on a listing grid is both an accessibility failure and lost image SEO.
    coalesce(cover.alt_text ->> tt.locale::text, tt.title || ' — ' || ct.name),
    cover.blurhash,
    cover.width,
    cover.height,
    t.cancellation,
    t.min_age
  from tours t
  join tour_translations tt on tt.tour_id = t.id
  join cities ci on ci.id = t.city_id
  join city_translations ct on ct.city_id = ci.id and ct.locale = tt.locale
  join countries c on c.id = ci.country_id
  join country_translations cot on cot.country_id = c.id and cot.locale = tt.locale
  join companies comp on comp.id = t.company_id
  left join lateral (
    select array_agg(cat.id) as ids, array_agg(catt.name) as names
    from tour_categories tc
    join categories cat on cat.id = tc.category_id
    join category_translations catt on catt.category_id = cat.id and catt.locale = tt.locale
    where tc.tour_id = t.id
  ) cats on true
  left join lateral (
    select ma.url, ma.blurhash, ma.width, ma.height, tm.alt_text
    from tour_media tm
    join media_assets ma on ma.id = tm.media_id
    where tm.tour_id = t.id
    order by tm.is_cover desc, tm.position
    limit 1
  ) cover on true
  where t.id = p_tour_id and t.status = 'published';
end;
$$;

-- A media change must refresh the index too, or a supplier swapping their
-- cover photo sees the old one on every listing page until the next edit.
create trigger reindex_on_media after insert or update or delete on tour_media
  for each row execute function internal.reindex_from_child();

-- Backfill anything already indexed.
do $$
declare r record;
begin
  for r in select distinct tour_id from tour_search_index loop
    perform internal.reindex_tour(r.tour_id);
  end loop;
end $$;

-- Sort orders the listing page offers. Each needs an index or the first
-- popular city makes every "sort by price" a sequential scan.
create index if not exists tsi_price_sort on tour_search_index (locale, city_id, from_price);
create index if not exists tsi_rating_sort on tour_search_index (locale, city_id, rating_avg desc);
create index if not exists tsi_discount_sort on tour_search_index (locale, city_id, discount_pct desc);
create index if not exists tsi_duration_idx on tour_search_index (locale, city_id, duration_minutes);

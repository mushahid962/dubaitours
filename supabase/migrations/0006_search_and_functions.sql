-- =====================================================================
-- 0006_search_and_functions.sql
-- Search index, price resolution, and the transactional booking core.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SEARCH INDEX
-- One flattened row per (tour, locale). Trigram for autocomplete,
-- tsvector for relevance, plus the facets the listing page filters on.
-- ---------------------------------------------------------------------
create table tour_search_index (
  tour_id        uuid not null references tours(id) on delete cascade,
  locale         locale_code not null,
  title          text not null,
  slug           text not null,
  summary        text,
  city_id        uuid not null,
  city_name      text not null,
  country_id     uuid not null,
  country_name   text not null,
  company_id     uuid not null,
  company_name   text not null,
  category_ids   uuid[] not null default '{}',
  category_names text[] not null default '{}',
  tour_type      tour_type not null,
  confirmation   confirmation_type not null,
  day_parts      day_part[] not null default '{}',
  guide_locales  locale_code[] not null default '{}',
  duration_minutes integer not null,
  from_price     numeric(12,2) not null,
  currency       currency_code not null,
  discount_pct   smallint not null default 0,
  rating_avg     numeric(3,2) not null default 0,
  rating_count   integer not null default 0,
  popularity_score numeric(10,4) not null default 0,
  pickup_included boolean not null default false,
  family_friendly boolean not null default true,
  is_luxury      boolean not null default false,
  is_private     boolean not null default false,
  location       geography(point, 4326),
  document       tsvector,
  updated_at     timestamptz not null default now(),
  primary key (tour_id, locale)
);
create index tsi_document_gin on tour_search_index using gin (document);
create index tsi_title_trgm on tour_search_index using gin (title gin_trgm_ops);
create index tsi_facets_idx on tour_search_index (locale, city_id, from_price);
create index tsi_category_gin on tour_search_index using gin (category_ids);
create index tsi_location_gix on tour_search_index using gist (location);

-- Rebuild the index rows for a single tour. Called by triggers and by the
-- nightly reconciliation job, so it must be idempotent.
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
    is_luxury, is_private, location, document
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
    setweight(to_tsvector('simple', array_to_string(tt.highlights, ' ')), 'D')
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
  where t.id = p_tour_id and t.status = 'published';
end;
$$;

-- Two trigger functions, because a `tours` record exposes `id` while every
-- child table exposes `tour_id`. One shared function would fail at runtime
-- on the missing field. Both are definer: a supplier inserting a tour has no
-- usage on the `internal` schema, by design.
create or replace function internal.reindex_from_tour()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
begin
  perform internal.reindex_tour(coalesce(new.id, old.id));
  return null;
end;
$$;

create or replace function internal.reindex_from_child()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
begin
  perform internal.reindex_tour(coalesce(new.tour_id, old.tour_id));
  return null;
end;
$$;

create trigger reindex_on_tour after insert or update on tours
  for each row execute function internal.reindex_from_tour();
create trigger reindex_on_translation after insert or update or delete on tour_translations
  for each row execute function internal.reindex_from_child();
create trigger reindex_on_category after insert or delete on tour_categories
  for each row execute function internal.reindex_from_child();

-- ---------------------------------------------------------------------
-- PRICING
-- Resolve the price for one pax type on one date: base price, then the
-- highest-priority matching rule wins. Pure and side-effect free.
-- ---------------------------------------------------------------------
create or replace function resolve_price(
  p_option_id uuid,
  p_pax       pax_type,
  p_date      date,
  p_currency  currency_code default 'AED'
)
returns table (list_price numeric, net_price numeric)
language plpgsql
stable
as $$
declare
  v_list numeric(12,2);
  v_net  numeric(12,2);
  v_rule price_rules%rowtype;
begin
  select tp.list_price, tp.net_price into v_list, v_net
  from tour_prices tp
  where tp.option_id = p_option_id and tp.pax = p_pax and tp.currency = p_currency;

  if v_list is null then
    return;   -- caller treats an empty result as "pax type not sold"
  end if;

  select * into v_rule
  from price_rules pr
  where pr.option_id = p_option_id
    and pr.is_active
    and (pr.pax is null or pr.pax = p_pax)
    and pr.valid_range @> p_date
    and extract(dow from p_date)::smallint = any (pr.weekdays)
  order by pr.priority desc, pr.id
  limit 1;

  if found then
    if v_rule.adjust_type = 'percentage' then
      v_list := round(v_list * (1 - v_rule.adjust_value / 100), 2);
    elsif v_rule.adjust_type = 'fixed_amount' then
      v_list := greatest(0, v_list - v_rule.adjust_value);
    end if;
  end if;

  return query select v_list, v_net;
end;
$$;

-- ---------------------------------------------------------------------
-- INVENTORY HOLDS
-- Seats are held (not booked) while the traveler pays. A hold takes a row
-- lock on the departure, so two concurrent checkouts cannot oversell.
-- ---------------------------------------------------------------------
create or replace function hold_seats(p_departure_id uuid, p_seats integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_free integer;
begin
  select capacity - seats_booked - seats_held into v_free
  from tour_departures
  where id = p_departure_id and not is_closed
  for update;

  if not found or v_free < p_seats then
    return false;
  end if;

  update tour_departures
     set seats_held = seats_held + p_seats
   where id = p_departure_id;

  return true;
end;
$$;

create or replace function release_seats(p_departure_id uuid, p_seats integer, p_convert boolean default false)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update tour_departures
     set seats_held   = greatest(0, seats_held - p_seats),
         seats_booked = seats_booked + case when p_convert then p_seats else 0 end
   where id = p_departure_id;
end;
$$;

-- Reaper for abandoned checkouts. Scheduled every minute via pg_cron.
create or replace function expire_stale_holds()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select b.id from bookings b
    where b.status in ('pending','awaiting_payment')
      and b.hold_expires_at is not null
      and b.hold_expires_at < now()
    for update skip locked
  loop
    perform release_seats(bi.departure_id, bi.seats, false)
    from booking_items bi where bi.booking_id = r.id;

    update bookings set status = 'expired', hold_expires_at = null where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- BOOKING REFERENCE — human-readable, unambiguous (no O/0/I/1).
-- ---------------------------------------------------------------------
create or replace function internal.generate_booking_reference()
returns text
language plpgsql
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_ref text;
  i integer;
begin
  loop
    v_ref := 'THG-';
    for i in 1..8 loop
      v_ref := v_ref || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bookings where reference = v_ref);
  end loop;
  return v_ref;
end;
$$;

create or replace function internal.set_booking_reference()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := internal.generate_booking_reference();
  end if;
  return new;
end;
$$;

create trigger booking_reference before insert on bookings
  for each row execute function internal.set_booking_reference();

-- ---------------------------------------------------------------------
-- CONFIRMATION — flips holds to booked and stamps tickets, atomically.
-- ---------------------------------------------------------------------
create or replace function confirm_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking bookings;
  r record;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking % not found', p_booking_id using errcode = 'no_data_found';
  end if;
  if v_booking.status = 'confirmed' then
    return v_booking;   -- idempotent: webhooks retry
  end if;
  if v_booking.status not in ('pending','awaiting_payment','on_hold') then
    raise exception 'Booking % cannot be confirmed from status %', p_booking_id, v_booking.status
      using errcode = 'invalid_parameter_value';
  end if;

  for r in select id, departure_id, seats from booking_items where booking_id = p_booking_id loop
    perform release_seats(r.departure_id, r.seats, true);
    update booking_items
       set ticket_code = encode(gen_random_bytes(16), 'hex')
     where id = r.id and ticket_code is null;
  end loop;

  update bookings
     set status = 'confirmed',
         confirmed_at = now(),
         hold_expires_at = null
   where id = p_booking_id
  returning * into v_booking;

  update tours t
     set booking_count = t.booking_count + 1
   from booking_items bi
   where bi.booking_id = p_booking_id and t.id = bi.tour_id;

  -- Coupon redemption is recorded here, inside the same transaction. Doing it
  -- in a follow-up call means a crash between the two leaves a coupon that was
  -- spent but never counted, and the usage limit stops meaning anything.
  if v_booking.coupon_id is not null then
    insert into coupon_redemptions (coupon_id, booking_id, profile_id, amount)
    values (v_booking.coupon_id, v_booking.id, v_booking.profile_id, v_booking.discount_total)
    on conflict (coupon_id, booking_id) do nothing;

    update coupons
       set used_count = used_count + 1
     where id = v_booking.coupon_id;
  end if;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------
-- DERIVED AGGREGATES — ratings and popularity, kept in the write path
-- for ratings (users notice the lag) and batched for popularity.
-- ---------------------------------------------------------------------
-- Definer because a traveller publishing a review must update aggregate
-- columns on `tours` and `companies`, which their RLS policies rightly forbid
-- them from writing directly.
create or replace function internal.recalc_tour_rating()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_tour uuid := coalesce(new.tour_id, old.tour_id);
begin
  update tours t set
    rating_avg = coalesce(agg.avg_rating, 0),
    rating_count = coalesce(agg.cnt, 0)
  from (
    select avg(rating)::numeric(3,2) as avg_rating, count(*) as cnt
    from reviews where tour_id = v_tour and status = 'published'
  ) agg
  where t.id = v_tour;

  update companies c set
    rating_avg = coalesce(agg.avg_rating, 0),
    rating_count = coalesce(agg.cnt, 0)
  from (
    select avg(rating)::numeric(3,2) as avg_rating, count(*) as cnt
    from reviews where company_id = coalesce(new.company_id, old.company_id) and status = 'published'
  ) agg
  where c.id = coalesce(new.company_id, old.company_id);

  return null;
end;
$$;

create trigger recalc_rating after insert or update or delete on reviews
  for each row execute function internal.recalc_tour_rating();

-- Popularity blends recent bookings, rating quality and freshness.
-- Run nightly: select refresh_popularity_scores();
create or replace function refresh_popularity_scores()
returns void
language sql
security definer set search_path = public
as $$
  update tours t set popularity_score = round(
      (coalesce((
        select count(*) from booking_items bi
        join bookings b on b.id = bi.booking_id
        where bi.tour_id = t.id
          and b.status in ('confirmed','completed')
          and b.created_at > now() - interval '30 days'
      ), 0) * 5.0)
    + (t.rating_avg * least(t.rating_count, 200) * 0.35)
    + (least(t.view_count, 50000) * 0.002)
    - (extract(epoch from now() - coalesce(t.published_at, t.created_at)) / 86400.0 * 0.15)
  , 4)
  where t.status = 'published';
$$;

-- ---------------------------------------------------------------------
-- NEARBY — powers "attractions near this tour" and "experiences near me".
-- ---------------------------------------------------------------------
create or replace function nearby_tours(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 20000,
  p_locale locale_code default 'en',
  p_limit integer default 24
)
returns table (tour_id uuid, title text, slug text, distance_m double precision, from_price numeric, rating_avg numeric)
language sql
stable
as $$
  select si.tour_id, si.title, si.slug,
         st_distance(si.location, st_point(p_lng, p_lat)::geography) as distance_m,
         si.from_price, si.rating_avg
  from tour_search_index si
  where si.locale = p_locale
    and si.location is not null
    and st_dwithin(si.location, st_point(p_lng, p_lat)::geography, p_radius_m)
  order by distance_m asc, si.popularity_score desc
  limit p_limit;
$$;

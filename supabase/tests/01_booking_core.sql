\set ON_ERROR_STOP on
\echo '--- 1. price resolution ---'
select pax, list_price, net_price from tour_options o
cross join lateral resolve_price(o.id, 'adult', current_date + 3, 'AED')
join lateral (select 'adult'::text as pax) p on true
where o.code = 'standard';

\echo '--- 2. seasonal rule applies (20% off next weekend) ---'
insert into price_rules (option_id, pax, valid_range, weekdays, adjust_type, adjust_value, priority)
select id, 'adult', daterange(current_date, current_date + 30), '{5,6}', 'percentage', 20, 10
from tour_options where code = 'standard';
select (resolve_price(o.id,'adult', d::date,'AED')).list_price as price, d::date, extract(dow from d) as dow
from tour_options o, generate_series(current_date, current_date+3, interval '1 day') d
where o.code='standard' order by d;

\echo '--- 3. hold seats, then oversell attempt ---'
select id as dep_id, capacity, seats_held, seats_booked from tour_departures
where option_id = (select id from tour_options where code='private-vip') order by starts_at limit 1 \gset
select hold_seats(:'dep_id', 4) as first_hold_ok;
select hold_seats(:'dep_id', 4) as second_hold_should_be_false;
select capacity, seats_held, seats_booked from tour_departures where id = :'dep_id';

\echo '--- 4. booking + confirmation is transactional and idempotent ---'
insert into bookings (company_id, currency, guest_email, guest_name, guest_phone,
                      subtotal, grand_total, amount_due, status, hold_expires_at)
select company_id, 'AED', 'traveller@example.com', 'Test Traveller', '+971500000001',
       1700, 1700, 1700, 'awaiting_payment', now() + interval '15 minutes'
from tours limit 1
returning id as booking_id, reference \gset

insert into booking_items (booking_id, tour_id, option_id, departure_id, starts_at, seats,
                           pax_breakdown, unit_prices, line_subtotal, line_total, commission_rate)
select :'booking_id', d.tour_id, d.option_id, d.id, d.starts_at, 4,
       '{"adult":4}'::jsonb, '{"adult":425}'::jsonb, 1700, 1700, 18
from tour_departures d where d.id = :'dep_id';

select status, reference from confirm_booking(:'booking_id');
select status from confirm_booking(:'booking_id');  -- replayed webhook
select capacity, seats_held, seats_booked from tour_departures where id = :'dep_id';
select ticket_code is not null as ticket_issued from booking_items where booking_id = :'booking_id';

\echo '--- 5. stale holds are reclaimed ---'
select hold_seats(id, 2) from tour_departures
where option_id = (select id from tour_options where code='standard') order by starts_at limit 1;
insert into bookings (company_id, currency, guest_email, guest_name, guest_phone,
                      subtotal, grand_total, amount_due, status, hold_expires_at)
select company_id,'AED','abandoned@example.com','Abandoned Cart','+971500000002',
       298,298,298,'awaiting_payment', now() - interval '1 minute'
from tours limit 1 returning id as stale_id \gset
insert into booking_items (booking_id, tour_id, option_id, departure_id, starts_at, seats,
                           pax_breakdown, unit_prices, line_subtotal, line_total, commission_rate)
select :'stale_id', d.tour_id, d.option_id, d.id, d.starts_at, 2,
       '{"adult":2}'::jsonb, '{"adult":149}'::jsonb, 298, 298, 18
from tour_departures d
where d.option_id = (select id from tour_options where code='standard')
order by d.starts_at limit 1;
select expire_stale_holds() as reclaimed;
select status from bookings where id = :'stale_id';
select seats_held from tour_departures
where option_id = (select id from tour_options where code='standard') order by starts_at limit 1;

\echo '--- 6. capacity constraint cannot be violated even directly ---'
do $$ begin
  update tour_departures set seats_booked = capacity + 1 where id = (select id from tour_departures limit 1);
  raise exception 'constraint did not fire';
exception when check_violation then raise notice 'check constraint held: oversell rejected';
end $$;

\echo '--- 7. search index + relevance ---'
select title, city_name, from_price, rating_avg,
       ts_rank(document, websearch_to_tsquery('simple','desert safari dubai')) as rank
from tour_search_index where document @@ websearch_to_tsquery('simple','desert safari dubai');

\echo '--- 8. geo nearby ---'
select title, round(distance_m/1000) as km from nearby_tours(25.2048, 55.2708, 80000, 'en', 5);

\echo '--- 9. ratings recompute on review publish ---'
insert into auth.users (id, email) values (gen_random_uuid(), 'reviewer@example.com') returning id as uid \gset
insert into profiles (id, full_name) values (:'uid','Reviewer') on conflict do nothing;
insert into reviews (tour_id, company_id, profile_id, status, rating, title, body, locale)
select t.id, t.company_id, :'uid', 'published', 5, 'Excellent', 'Great sunset.', 'en' from tours t limit 1;
select rating_avg, rating_count from tours;

\echo '--- 10. popularity refresh runs ---'
select refresh_popularity_scores();
select round(popularity_score,2) as popularity from tours;

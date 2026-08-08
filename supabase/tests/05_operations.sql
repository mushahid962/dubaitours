-- =====================================================================
-- 05_operations.sql — manifests, ticket redemption, review replies, payouts.
-- =====================================================================
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email) values (gen_random_uuid(),'ops@gulfdunes.example') returning id as ops \gset
insert into auth.users (id, email) values (gen_random_uuid(),'rival@other.example') returning id as rival \gset
insert into auth.users (id, email) values (gen_random_uuid(),'guest@example.com') returning id as guest \gset

insert into company_members (company_id, profile_id, role, accepted_at)
select id, :'ops', 'company_owner', now() from companies limit 1;

-- A rival operator, to prove cross-tenant isolation.
insert into companies (slug, legal_name, display_name, status, country_id, contact_email)
select 'rival-tours', 'Rival Tours LLC', 'Rival Tours', 'active',
       (select id from countries where iso2='AE'), 'x@rival.example'
returning id as rival_co \gset
insert into company_members (company_id, profile_id, role, accepted_at)
values (:'rival_co', :'rival', 'company_owner', now());

-- A confirmed booking with a ticket.
insert into bookings (profile_id, company_id, currency, guest_email, guest_name, guest_phone,
                      subtotal, grand_total, amount_due, commission_total, supplier_net, status)
select :'guest', (select company_id from company_members where profile_id = :'ops'),
       'AED','guest@example.com','Maryam Al Sayed','+971501234567',
       298, 298, 298, 53.64, 244.36, 'awaiting_payment'
returning id as bk \gset

insert into booking_items (booking_id, tour_id, option_id, departure_id, starts_at, seats,
                           pax_breakdown, unit_prices, line_subtotal, line_total, commission_rate)
select :'bk', d.tour_id, d.option_id, d.id, d.starts_at, 2,
       '{"adult":2}'::jsonb, '{"adult":149}'::jsonb, 298, 298, 18
from tour_departures d order by d.starts_at limit 1;

select hold_seats((select departure_id from booking_items where booking_id = :'bk'), 2);
select reference from confirm_booking(:'bk');
select ticket_code from booking_items where booking_id = :'bk' \gset

\echo ''
\echo '=== 1. Operator sees their manifest ==='
set role authenticated; set request.jwt.claim.sub = :'ops';
select reference, guest_name, seats, pickup_point is null as no_pickup, redeemed_at is null as not_checked_in
from booking_manifest;

create temp table fixture (ticket_code text, review_id uuid);
insert into fixture (ticket_code) values (:'ticket_code');

\echo ''
\echo '=== 2. Rival operator sees nothing ==='
set request.jwt.claim.sub = :'rival';
select count(*) as manifest_rows_for_rival from booking_manifest;

\echo '--- Rival cannot redeem someone else''s ticket ---'
-- The code is passed in from outside: reading it from the table as the rival
-- would return NULL, because RLS already hides the row from them.
do $$
declare v_code text := (select ticket_code from fixture);
begin
  perform redeem_ticket(v_code);
  raise exception 'CROSS-OPERATOR REDEMPTION SUCCEEDED';
exception when insufficient_privilege then raise notice 'cross-operator redemption blocked';
end $$;

\echo ''
\echo '=== 3. Guide checks the traveller in ==='
set request.jwt.claim.sub = :'ops';
select guest_name, seats, already_redeemed from redeem_ticket(:'ticket_code');

\echo '--- Scanning twice is idempotent, and says so ---'
select guest_name, already_redeemed, redeemed_at is not null as timestamp_preserved
from redeem_ticket(:'ticket_code');

\echo '--- An unknown ticket is refused ---'
do $$ begin
  perform redeem_ticket('not-a-real-ticket');
  raise exception 'UNKNOWN TICKET ACCEPTED';
exception when no_data_found then raise notice 'unknown ticket refused';
end $$;

\echo ''
\echo '=== 4. Review reply ==='
-- Seeded as superuser: the review insert policy requires the reviewer's own
-- completed booking on a departure that has already happened, which suite 02
-- covers. Here we only care about who may REPLY.
reset role;
insert into reviews (tour_id, company_id, profile_id, status, rating, title, body, locale)
select t.id, t.company_id, :'guest', 'published', 4, 'Great sunset', 'Driver was excellent, dinner was cold.', 'en'
from tours t limit 1
returning id as rev \gset
update fixture set review_id = :'rev';

set role authenticated;
set request.jwt.claim.sub = :'rival';
do $$
declare v_review uuid := (select review_id from fixture);
begin
  perform reply_to_review(v_review, 'Thanks!');
  raise exception 'CROSS-OPERATOR REPLY SUCCEEDED';
exception when insufficient_privilege or no_data_found
  then raise notice 'cross-operator review reply blocked';
end $$;

set request.jwt.claim.sub = :'ops';
do $$
declare v_review uuid := (select review_id from fixture);
begin
  perform reply_to_review(v_review, '   ');
  raise exception 'BLANK REPLY ACCEPTED';
exception when invalid_parameter_value then raise notice 'blank reply refused';
end $$;
select supplier_reply is not null as replied, supplier_replied_at is not null as timestamped
from reply_to_review(:'rev', 'Sorry about the dinner — we have changed our catering supplier since.');

\echo ''
\echo '=== 5. Payout ledger ==='
select reference, grand_total, commission_total, supplier_net, paid_out
from payout_ledger where company_id = (select company_id from company_members where profile_id = :'ops');

\echo ''
\echo '=== 6. Cover image is exactly one ==='
select count(*) filter (where is_cover) as covers_before from tour_media;
select set_tour_cover((select tour_id from tour_media limit 1), (select media_id from tour_media limit 1));
select count(*) filter (where is_cover) as covers_after from tour_media;
reset role;

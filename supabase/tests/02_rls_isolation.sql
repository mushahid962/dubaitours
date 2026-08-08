\set ON_ERROR_STOP on
-- Two travellers and one supplier staff member.
insert into auth.users (id, email) values (gen_random_uuid(),'alice@example.com') returning id as alice \gset
insert into auth.users (id, email) values (gen_random_uuid(),'mallory@example.com') returning id as mallory \gset
insert into auth.users (id, email) values (gen_random_uuid(),'ops@gulfdunes.example') returning id as ops \gset
insert into company_members (company_id, profile_id, role, accepted_at)
select id, :'ops', 'company_owner', now() from companies limit 1;

-- Alice books.
insert into bookings (profile_id, company_id, currency, guest_email, guest_name, guest_phone,
                      subtotal, grand_total, amount_due, status)
select :'alice', id, 'AED','alice@example.com','Alice','+971500000003',149,149,149,'confirmed'
from companies limit 1 returning id as bk \gset

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;

\echo '--- Alice sees her own booking ---'
set role authenticated; set request.jwt.claim.sub = :'alice';
select count(*) as visible_to_alice from bookings;

\echo '--- Mallory sees nothing ---'
set request.jwt.claim.sub = :'mallory';
select count(*) as visible_to_mallory from bookings;

\echo '--- Supplier sees bookings for their own company ---'
set request.jwt.claim.sub = :'ops';
select count(*) as visible_to_supplier from bookings;

\echo '--- Mallory cannot promote herself to admin ---'
set request.jwt.claim.sub = :'mallory';
do $$ begin
  update profiles set role = 'super_admin' where id = auth.uid();
  if (select role from profiles where id = auth.uid()) = 'super_admin' then
    raise exception 'ESCALATION SUCCEEDED - policy is broken';
  end if;
  raise notice 'escalation blocked: role is still %', (select role from profiles where id = auth.uid());
exception when insufficient_privilege or check_violation then
  raise notice 'escalation blocked by policy';
end $$;

\echo '--- Mallory cannot review a tour she never booked ---'
do $$ begin
  insert into reviews (tour_id, company_id, profile_id, status, rating, body, locale)
  select t.id, t.company_id, auth.uid(), 'published', 5, 'Fake review', 'en' from tours t limit 1;
  raise exception 'FAKE REVIEW ACCEPTED - policy is broken';
exception when insufficient_privilege then raise notice 'fake review blocked by policy';
end $$;

\echo '--- Anonymous visitors still read the published catalog ---'
reset role; set role anon; set request.jwt.claim.sub = '';
grant usage on schema public to anon;
grant select on all tables in schema public to anon;
select count(*) as tours_visible_to_anon from tour_search_index;
select count(*) as bookings_visible_to_anon from bookings;
reset role;

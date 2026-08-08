-- =====================================================================
-- 03_actor_boundaries.sql
-- Proves the three-actor model holds at the database, not in the UI:
-- traveler, company_owner (via approved application), admin.
-- =====================================================================
\set ON_ERROR_STOP on

grant usage on schema public to authenticated, anon;
grant select, insert, update on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into auth.users (id, email) values (gen_random_uuid(),'omar@desertco.example') returning id as omar \gset
insert into auth.users (id, email) values (gen_random_uuid(),'sara@example.com') returning id as sara \gset
insert into auth.users (id, email) values (gen_random_uuid(),'admin@travelhubgulf.com') returning id as boss \gset
update profiles set role = 'super_admin' where id = :'boss';

\echo ''
\echo '=== 1. Omar (traveler) applies to list his business ==='
set role authenticated; set request.jwt.claim.sub = :'omar';
insert into company_applications (submitted_by, legal_name, display_name, country_id,
  contact_email, contact_phone, about, years_operating, trade_license_no, trade_license_url)
select :'omar', 'Desert Co Tourism LLC', 'Desert Co', c.id,
       'omar@desertco.example', '+971501112233',
       'Family-run dune buggy operator working the Al Badayer dunes since 2014.',
       11, 'CN-1189234', 'private://licences/omar-2026.pdf'
from countries c where c.iso2 = 'AE'
returning id as app_id \gset
select status, submitted_at is null as not_yet_submitted from company_applications where id = :'app_id';

\echo ''
\echo '--- Omar cannot approve his own application by writing status directly ---'
do $$ begin
  update company_applications set status = 'approved' where submitted_by = auth.uid();
  if (select status from company_applications where submitted_by = auth.uid()) = 'approved' then
    raise exception 'SELF-APPROVAL SUCCEEDED - policy is broken';
  end if;
  raise notice 'self-approval blocked: status is still %',
    (select status from company_applications where submitted_by = auth.uid());
exception when insufficient_privilege or check_violation then
  raise notice 'self-approval blocked by policy';
end $$;

\echo '--- Omar cannot make himself a company_owner ---'
do $$ begin
  update profiles set role = 'company_owner' where id = auth.uid();
  if (select role from profiles where id = auth.uid()) <> 'traveler' then
    raise exception 'ROLE ESCALATION SUCCEEDED - policy is broken';
  end if;
  raise notice 'role escalation blocked: still %', (select role from profiles where id = auth.uid());
exception when insufficient_privilege or check_violation then
  raise notice 'role escalation blocked by policy';
end $$;

\echo '--- Omar cannot call the admin-only approval function ---'
do $$ begin
  perform approve_company_application((select id from company_applications where submitted_by = auth.uid()));
  raise exception 'NON-ADMIN APPROVAL SUCCEEDED - function guard is broken';
exception when insufficient_privilege then raise notice 'approve_company_application rejected non-admin';
end $$;

\echo '--- Omar submits properly ---'
select status, submitted_at is not null as submitted from submit_company_application(:'app_id');

\echo ''
\echo '=== 2. Sara (unrelated traveler) cannot see Omar''s application ==='
set request.jwt.claim.sub = :'sara';
select count(*) as applications_visible_to_sara from company_applications;

\echo ''
\echo '=== 3. Admin reviews the queue and approves ==='
set request.jwt.claim.sub = :'boss';
select count(*) as queue_size from company_applications where status = 'submitted';
select slug, status, verification, commission_rate
from approve_company_application(:'app_id', 15.00, 'Licence and insurance verified.');

\echo '--- replayed approval is idempotent ---'
select slug from approve_company_application(:'app_id', 15.00);

\echo ''
\echo '=== 4. Omar is now a company owner ==='
set request.jwt.claim.sub = :'omar';
select role from profiles where id = :'omar';
select role, permissions from company_members where profile_id = :'omar';
select count(*) as companies_omar_can_manage from companies where is_company_member(id);

\echo '--- Omar can create a tour under HIS company ---'
insert into tours (company_id, city_id, primary_category_id, status, duration_minutes)
select (select company_id from company_members where profile_id = :'omar'),
       (select id from cities limit 1),
       (select id from categories limit 1), 'draft', 180
returning 'own tour created' as result;

\echo '--- Omar CANNOT create a tour under a competitor''s company ---'
do $$ begin
  insert into tours (company_id, city_id, primary_category_id, status, duration_minutes)
  select c.id, (select id from cities limit 1), (select id from categories limit 1), 'draft', 180
  from companies c where c.slug = 'gulf-dunes-tourism';
  raise exception 'CROSS-COMPANY WRITE SUCCEEDED - policy is broken';
exception when insufficient_privilege then raise notice 'cross-company tour insert blocked by policy';
end $$;

\echo '--- Omar cannot see a competitor''s bookings ---'
select count(*) as competitor_bookings_visible from bookings
where company_id = (select id from companies where slug = 'gulf-dunes-tourism');

\echo ''
\echo '=== 5. Admin suspends the company; listings go down in the same transaction ==='
set request.jwt.claim.sub = :'boss';
update tours set status = 'published', published_at = now()
where company_id = (select company_id from company_members where profile_id = :'omar');
select status, suspended_reason from suspend_company(
  (select company_id from company_members where profile_id = :'omar'),
  'Licence expired — awaiting renewal.');
select status, count(*) from tours
where company_id = (select company_id from company_members where profile_id = :'omar')
group by status;

\echo ''
\echo '=== 6. Audit trail exists and names the actor ==='
select action, entity_type, actor_role from audit_logs order by id;
select from_status, to_status from company_application_events
where application_id = :'app_id' order by id;
reset role;

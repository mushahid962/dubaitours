-- =====================================================================
-- 04_tour_workflow.sql — a supplier may build a listing but not publish it.
-- =====================================================================
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email) values (gen_random_uuid(),'ops@gulfdunes.example') returning id as ops \gset
insert into auth.users (id, email) values (gen_random_uuid(),'boss@travelhubgulf.com') returning id as boss \gset
update profiles set role = 'super_admin' where id = :'boss';
insert into company_members (company_id, profile_id, role, accepted_at)
select id, :'ops', 'company_owner', now() from companies limit 1;
update profiles set role = 'company_owner' where id = :'ops';

select id as tour_id from tours limit 1 \gset

\echo ''
\echo '=== Supplier edits their own listing ==='
set role authenticated; set request.jwt.claim.sub = :'ops';
update tours set duration_minutes = 400 where id = :'tour_id';
select duration_minutes as edit_applied from tours where id = :'tour_id';

\echo '--- Supplier CANNOT publish directly ---'
-- Start from draft: the seeded tour is already published, and setting a
-- column to the value it already holds is not a status change.
update tours set status = 'draft' where id = :'tour_id';
do $$ begin
  update tours set status = 'published' where id = (select id from tours limit 1);
  raise exception 'SELF-PUBLISH SUCCEEDED - guard is broken';
exception when insufficient_privilege then raise notice 'self-publish blocked by trigger';
end $$;

\echo '--- Supplier CANNOT backdate their own approval ---'
do $$ begin
  update tours set reviewed_by = auth.uid(), reviewed_at = now(), published_at = now()
  where id = (select id from tours limit 1);
  if (select reviewed_by from tours where id = (select id from tours limit 1)) is not null then
    raise exception 'REVIEWER FIELDS WRITABLE - guard is broken';
  end if;
  raise notice 'reviewer fields silently preserved by trigger';
end $$;

\echo ''
\echo '=== Submitting an incomplete listing is refused ==='
insert into tours (company_id, city_id, primary_category_id, status, duration_minutes)
select (select company_id from company_members where profile_id = :'ops'),
       (select id from cities limit 1), (select id from categories limit 1), 'draft', 120
returning id as empty_tour \gset
do $$ begin
  perform submit_tour_for_review((select id from tours where duration_minutes = 120 limit 1));
  raise exception 'INCOMPLETE SUBMISSION ACCEPTED';
exception when invalid_parameter_value then raise notice 'incomplete listing refused with a checklist';
end $$;

\echo ''
\echo '=== Bulk availability generation ==='
select generate_departures(
  (select id from tour_options where code = 'standard'),
  current_date + 61, current_date + 90, time '09:00', 20, '{4,5,6}'
) as departures_created;

\echo '--- Re-running does not reset existing seats ---'
select generate_departures(
  (select id from tour_options where code = 'standard'),
  current_date + 61, current_date + 90, time '09:00', 20, '{4,5,6}'
) as second_run_creates;

\echo ''
\echo '=== Supplier dashboard read models ==='
select title, status, completeness_score, media_count, future_departures
from supplier_tour_rows where locale = 'en' and title is not null limit 2;

\echo ''
\echo '=== Admin publishes ==='
set request.jwt.claim.sub = :'boss';
update tours set status = 'in_review', submitted_at = now() where id = :'tour_id';
select status, published_at is not null as live from approve_tour(:'tour_id', 'Licence and photos checked.');

\echo '--- Admin can reject with a reason; blank reason refused ---'
update tours set status = 'in_review' where id = :'tour_id';
do $$ begin
  perform reject_tour((select id from tours limit 1), '   ');
  raise exception 'BLANK REASON ACCEPTED';
exception when invalid_parameter_value then raise notice 'blank rejection reason refused';
end $$;
select status, rejected_reason from reject_tour(:'tour_id', 'Photo 2 shows another operator''s vehicle.');

\echo ''
\echo '=== Audit trail ==='
select action, entity_type, actor_role from audit_logs order by id;
reset role;

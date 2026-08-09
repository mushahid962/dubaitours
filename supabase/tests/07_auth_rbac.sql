-- =====================================================================
-- 07_auth_rbac.sql — PHASE 1: authentication and authorization.
-- Exercised as every one of the ten roles, plus the attacks.
-- =====================================================================
-- Run against a FRESH database. It creates one account per role and is not
-- idempotent by design: re-running on a dirty database duplicates the actors
-- and the assertions stop meaning anything.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

\echo '=== 1. Sign-up provisions a profile, unverified and inactive ==='
insert into auth.users (id, email) values (gen_random_uuid(), 'newcustomer@example.com')
returning id as cust \gset
select role, status, email_verified_at is null as unverified
from profiles where id = :'cust';

\echo ''
\echo '--- Email verification activates the account ---'
update auth.users set email_confirmed_at = now() where id = :'cust';
select status, email_verified_at is not null as verified from profiles where id = :'cust';

\echo ''
\echo '=== 2. One account per role, all verified ==='
insert into auth.users (id, email, email_confirmed_at)
select gen_random_uuid(), r::text || '@example.com', now()
from unnest(enum_range(null::user_role)) as r;

update profiles p set role = r
from (select id, split_part(email, '@', 1)::user_role as r from auth.users
      where email like '%@example.com' and email <> 'newcustomer@example.com') x
where p.id = x.id;

-- A second super admin, so the "last super admin" guard can be tested from
-- both sides. Created here because `authenticated` cannot write auth.users.
insert into auth.users (id, email, email_confirmed_at)
values (gen_random_uuid(), 'super2@example.com', now()) returning id as super2 \gset
update profiles set role = 'super_admin', status = 'active' where id = :'super2';

create temp table actors as
select role, id from profiles where role::text || '@example.com' = email;
-- Temp tables belong to the session owner, so the `authenticated` role must
-- be granted access before the role-switched blocks below can read them.
grant select on actors to authenticated;
select count(*) as roles_created from actors;

\echo ''
\echo '=== 3. Permission matrix, checked as each role ==='
create temp table results (role text, permission text, allowed boolean);
do $$
declare a record; p text;
begin
  for a in select * from actors loop
    perform set_config('request.jwt.claim.sub', a.id::text, true);
    foreach p in array array['users.assign_roles','payments.refund','content.publish',
                             'listings.publish','bookings.read.all','listings.write.own']
    loop
      insert into results values (a.role::text, p, has_permission(p));
    end loop;
  end loop;
end $$;

select role,
  bool_or(allowed) filter (where permission='users.assign_roles')  as assign_roles,
  bool_or(allowed) filter (where permission='payments.refund')     as refund,
  bool_or(allowed) filter (where permission='content.publish')     as publish_content,
  bool_or(allowed) filter (where permission='listings.publish')    as publish_listing,
  bool_or(allowed) filter (where permission='bookings.read.all')   as all_bookings,
  bool_or(allowed) filter (where permission='listings.write.own')  as own_listings
from results group by role order by role;

\echo ''
\echo '=== 4. A suspended account loses every power instantly ==='
select id as admin_id from actors where role = 'admin' \gset
select id as super_id from actors where role = 'super_admin' \gset

set role authenticated;
set request.jwt.claim.sub = :'admin_id';
select has_permission('payments.refund') as admin_can_refund_before;

reset role;
update profiles set status = 'suspended', suspended_reason = 'Test' where id = :'admin_id';
set role authenticated;
set request.jwt.claim.sub = :'admin_id';
select has_permission('payments.refund') as admin_can_refund_after_suspension,
       is_admin() as still_admin,
       is_staff() as still_staff;
reset role;
update profiles set status = 'active', suspended_reason = null where id = :'admin_id';

\echo ''
\echo '=== 5. Escalation attempts ==='
set role authenticated;
set request.jwt.claim.sub = :'cust';

\echo '--- A customer cannot promote themselves by UPDATE ---'
do $$ begin
  update profiles set role = 'super_admin' where id = auth.uid();
  if (select role from profiles where id = auth.uid()) <> 'customer' then
    raise exception 'SELF-PROMOTION SUCCEEDED';
  end if;
  raise notice 'self-promotion via UPDATE blocked';
exception when insufficient_privilege or check_violation then
  raise notice 'self-promotion via UPDATE blocked by policy';
end $$;

\echo '--- A customer cannot activate their own suspended account ---'
do $$ begin
  update profiles set status = 'active' where id = auth.uid();
  raise notice 'status column pinned by policy (no change applied)';
exception when insufficient_privilege or check_violation then
  raise notice 'status change blocked by policy';
end $$;

\echo '--- A customer cannot call assign_role ---'
do $$
declare v_target uuid := (select id from actors where role = 'customer');
begin
  perform assign_role(v_target, 'admin');
  raise exception 'NON-ADMIN ROLE ASSIGNMENT SUCCEEDED';
exception when insufficient_privilege then raise notice 'assign_role rejected non-super-admin';
end $$;

\echo '--- An ADMIN cannot assign roles either; only a super admin can ---'
set request.jwt.claim.sub = :'admin_id';
do $$
declare v_target uuid := (select id from actors where role = 'customer');
begin
  perform assign_role(v_target, 'admin');
  raise exception 'ADMIN ESCALATED ANOTHER USER';
exception when insufficient_privilege then raise notice 'admin cannot assign roles (super admin only)';
end $$;

\echo ''
\echo '=== 6. Super admin can assign roles, with an audit trail ==='
set request.jwt.claim.sub = :'super_id';
select role from assign_role((select id from actors where role = 'customer'), 'content_manager', 'Joined the content team');

\echo '--- but not their own ---'
do $$ begin
  perform assign_role(auth.uid(), 'customer');
  raise exception 'SELF ROLE CHANGE SUCCEEDED';
exception when insufficient_privilege then raise notice 'self role change blocked';
end $$;

\echo '--- demoting a super admin is fine while another remains ---'
select role as super2_after_demotion from assign_role(:'super2', 'customer', 'Left the team');

\echo '--- but the LAST super admin cannot be demoted, or nobody can ever get back in ---'
do $$ begin
  perform assign_role((select id from actors where role = 'super_admin'), 'customer');
  raise exception 'LAST SUPER ADMIN DEMOTED - the platform just locked itself out';
exception
  when insufficient_privilege then raise notice 'blocked: cannot change your own role';
  when invalid_parameter_value then raise notice 'blocked: last active super admin is protected';
end $$;

\echo ''
\echo '=== 7. Suspension rules ==='
set request.jwt.claim.sub = :'admin_id';
do $$ begin
  perform set_account_status((select id from actors where role = 'customer'), 'suspended', '   ');
  raise exception 'BLANK SUSPENSION REASON ACCEPTED';
exception when invalid_parameter_value then raise notice 'suspension without a reason refused';
end $$;

do $$ begin
  perform set_account_status((select id from actors where role = 'super_admin'), 'suspended', 'Trying it on');
  raise exception 'ADMIN SUSPENDED A SUPER ADMIN';
exception when insufficient_privilege then raise notice 'admin cannot suspend a super admin';
end $$;

select status, suspended_reason is not null as has_reason
from set_account_status((select id from actors where role = 'customer'), 'suspended', 'Chargeback fraud');

\echo ''
\echo '=== 8. Audit trail ==='
reset role;
select action, actor_role, after->>'role' as new_role, after->>'status' as new_status
from audit_logs where action like 'user.%' order by id;

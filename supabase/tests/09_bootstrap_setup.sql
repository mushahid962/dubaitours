-- =====================================================================
-- 09_bootstrap_setup.sql — /setup must work exactly once, ever.
-- =====================================================================
\set ON_ERROR_STOP on

\echo '=== 1. On a fresh database, setup is open ==='
select is_setup_complete() as setup_complete;

\echo ''
\echo '=== 2. First person through claims super admin ==='
insert into auth.users (email) values ('founder@mysite.com') returning id as founder \gset
select role, status from profiles where id = :'founder';

select role, status, email_verified_at is not null as verified
from bootstrap_super_admin(:'founder', '203.0.113.10');

\echo ''
\echo '--- Setup is now closed ---'
select is_setup_complete() as setup_complete;

\echo ''
\echo '=== 3. A second attempt is refused ==='
insert into auth.users (email) values ('attacker@example.com') returning id as attacker \gset
do $$
declare v_id uuid := (select p.id from profiles p join auth.users u on u.id = p.id
                      where u.email = 'attacker@example.com');
begin
  perform bootstrap_super_admin(v_id, '198.51.100.7');
  raise exception 'SECOND SETUP SUCCEEDED - the route is a permanent back door';
exception when insufficient_privilege then
  raise notice 'second setup attempt refused';
end $$;

\echo '--- and the attacker is still a plain customer ---'
select p.role, p.status from profiles p join auth.users u on u.id = p.id
where u.email = 'attacker@example.com';

\echo ''
\echo '=== 4. Even deleting the settings row does not reopen it ==='
delete from site_settings where key = 'setup';
select is_setup_complete() as still_closed;

\echo ''
\echo '=== 5. The successful claim is on the record ==='
-- Rejections are logged by the application action, not here: a row inserted
-- before a RAISE rolls back with the exception.
select action, entity_type, after->>'reason' as reason, host(ip) as from_ip
from audit_logs where action like 'setup.%' order by id;

\echo ''
\echo '=== 6. The founder has every permission ==='
select count(*) as permissions from role_matrix where role = 'super_admin';

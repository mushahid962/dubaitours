import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { requirePermission, isSuperAdmin, getActor } from '@/lib/auth/session';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { ROLE_META, type Role, type AccountStatus } from '@/lib/auth/roles';
import { formatDate } from '@/lib/format';
import { UserRow } from '@/components/admin/user-row';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TeamPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  await requirePermission(locale, 'users.read', '/admin/team');
  const actor = await getActor();
  const canAssign = isSuperAdmin(actor);

  const { q, role } = await searchParams;
  const supabase = await getSupabaseServerClient();

  let query = supabase
    .from('profiles')
    .select('id, email, full_name, display_name, role, status, suspended_reason, email_verified_at, last_login_at, created_at')
    .order('created_at', { ascending: false }).limit(100);

  if (q) query = query.ilike('email', `%${q}%`);
  if (role) query = query.eq('role', role);

  const { data } = await query;
  const users = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    email: row.email ?? '—',
    name: row.display_name ?? row.full_name ?? '—',
    role: String(row.role) as Role,
    status: String(row.status) as AccountStatus,
    suspendedReason: row.suspended_reason ?? null,
    verified: Boolean(row.email_verified_at),
    lastLogin: row.last_login_at ? formatDate(String(row.last_login_at), locale) : 'Never',
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Team &amp; users</h1>
        <p className="max-w-2xl text-[var(--text-sm)] text-[var(--ink-soft)]">
          {canAssign
            ? 'You can change roles and suspend accounts. Every change is written to the audit log with your name on it.'
            : 'You can view accounts. Only a super admin can change a role — which is why the highest privilege on the platform is not self-replicating.'}
        </p>
      </header>

      <form action="" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q ?? ''} placeholder="Search by email"
          className="h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]" />
        <select name="role" defaultValue={role ?? ''}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]">
          <option value="">All roles</option>
          {Object.entries(ROLE_META).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 text-[var(--text-sm)] font-semibold text-white">
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
          No accounts match.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <UserRow key={user.id} user={user} canAssign={canAssign} isSelf={user.id === actor?.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

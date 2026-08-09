import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import {
  type Role, type AccountStatus, type Permission,
  isInternalRole, isBusinessRole, homeForRole,
} from '@/lib/auth/roles';

export type { Role, AccountStatus, Permission };

export type Actor = {
  id: string;
  email: string | null;
  role: Role;
  status: AccountStatus;
  permissions: Permission[];
  suspendedReason: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  preferredLocale: Locale;
  preferredCurrency: string;
  companies: Array<{ id: string; slug: string; name: string; role: Role; permissions: string[] }>;
};

/**
 * The signed-in actor, or null.
 *
 * `cache` makes this one query per request however many components ask.
 * These helpers decide what to *render*; RLS decides what is *allowed*.
 * Deleting this file would leak nothing — the database would still refuse.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  if (!isDatabaseConfigured()) return null;

  const supabase = await getSupabaseServerClient();

  // getUser() verifies the JWT with the auth server. getSession() only reads
  // the cookie, so it is never used for an authorisation decision.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profileRow }, { data: membershipRows }] = await Promise.all([
    supabase.from('profiles')
      .select('role, status, suspended_reason, email, email_verified_at, display_name, full_name, avatar_url, preferred_locale, preferred_currency')
      .eq('id', user.id).maybeSingle(),
    supabase.from('company_members')
      .select('role, permissions, company:companies!inner ( id, slug, display_name, status )')
      .eq('profile_id', user.id).not('accepted_at', 'is', null),
  ]);

  if (!profileRow) return null;

  const profile = profileRow as unknown as {
    role: Role; status: AccountStatus; suspended_reason: string | null;
    email: string | null; email_verified_at: string | null;
    display_name: string | null; full_name: string | null; avatar_url: string | null;
    preferred_locale: string | null; preferred_currency: string | null;
  };

  // Permissions come from the database, not from a hard-coded map, so the
  // UI can never claim a power the policies will refuse.
  const { data: permissionRows } = await supabase
    .from('role_permissions').select('permission').eq('role', profile.role);

  const memberships = (membershipRows ?? []) as unknown as Array<{
    role: Role; permissions: string[] | null;
    company: { id: string; slug: string; display_name: string; status: string };
  }>;

  return {
    id: user.id,
    email: profile.email ?? user.email ?? null,
    role: profile.role,
    status: profile.status,
    suspendedReason: profile.suspended_reason,
    emailVerified: Boolean(profile.email_verified_at),
    permissions: profile.status === 'active'
      ? ((permissionRows ?? []) as unknown as Array<{ permission: Permission }>).map((r) => r.permission)
      // A suspended account keeps its role but loses every permission, which
      // mirrors exactly what has_permission() does in the database.
      : [],
    displayName: profile.display_name ?? profile.full_name ?? null,
    avatarUrl: profile.avatar_url,
    preferredLocale: (profile.preferred_locale ?? DEFAULT_LOCALE) as Locale,
    preferredCurrency: profile.preferred_currency ?? 'AED',
    companies: memberships
      .filter((m) => m.company?.status === 'active')
      .map((m) => ({
        id: m.company.id, slug: m.company.slug, name: m.company.display_name,
        role: m.role, permissions: m.permissions ?? [],
      })),
  };
});

export const can = (actor: Actor | null, permission: Permission) =>
  Boolean(actor && actor.status === 'active' && actor.permissions.includes(permission));

export const isStaff = (actor: Actor | null) =>
  Boolean(actor && actor.status === 'active' && isInternalRole(actor.role));

export const isAdmin = (actor: Actor | null) =>
  Boolean(actor && actor.status === 'active' && ['admin', 'super_admin'].includes(actor.role));

export const isSuperAdmin = (actor: Actor | null) =>
  Boolean(actor && actor.status === 'active' && actor.role === 'super_admin');

export const isBusinessUser = (actor: Actor | null) =>
  Boolean(actor && actor.status === 'active' && isBusinessRole(actor.role));

const prefixFor = (locale: Locale) => (locale === DEFAULT_LOCALE ? '' : `/${locale}`);

export async function requireActor(locale: Locale, next: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`${prefixFor(locale)}/sign-in?next=${encodeURIComponent(next)}`);

  // Status is checked on every protected page, not only at sign-in — a
  // suspension must take effect on the next request, not the next login.
  if (actor.status === 'suspended' || actor.status === 'banned') {
    redirect(`${prefixFor(locale)}/account/suspended`);
  }
  if (actor.status === 'pending_verification') {
    redirect(`${prefixFor(locale)}/verify-email`);
  }
  return actor;
}

export async function requirePermission(
  locale: Locale, permission: Permission, next: string,
): Promise<Actor> {
  const actor = await requireActor(locale, next);
  // 404 rather than 403: a 403 confirms the page exists to someone probing.
  if (!can(actor, permission)) redirect(`${prefixFor(locale)}/404`);
  return actor;
}

export async function requireAdmin(locale: Locale, next: string): Promise<Actor> {
  const actor = await requireActor(locale, next);
  if (!isStaff(actor)) redirect(`${prefixFor(locale)}/404`);
  return actor;
}

/**
 * Resolves which business the request is acting for. Staff pass through so
 * support can open a supplier's dashboard — and `audit_logs` records it.
 */
export async function requireCompany(locale: Locale, companyId: string, next: string) {
  const actor = await requireActor(locale, next);
  const membership = actor.companies.find((company) => company.id === companyId);
  if (!membership && !isStaff(actor)) redirect(`${prefixFor(locale)}/404`);
  return { actor, membership: membership ?? null };
}

export function canManageCompany(actor: Actor, companyId: string, permission: string) {
  if (isAdmin(actor)) return true;
  const membership = actor.companies.find((company) => company.id === companyId);
  if (!membership) return false;
  return membership.role === 'business_owner' || membership.permissions.includes(permission);
}

export { homeForRole };

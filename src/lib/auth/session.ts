import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export type UserRole =
  | 'traveler' | 'company_owner' | 'company_staff'
  | 'editor' | 'support' | 'admin' | 'super_admin';

export type Actor = {
  id: string;
  email: string | null;
  role: UserRole;
  displayName: string | null;
  avatarUrl: string | null;
  preferredLocale: Locale;
  preferredCurrency: string;
  /** Companies this person can act for. Empty for travellers and admins. */
  companies: Array<{ id: string; slug: string; name: string; role: UserRole; permissions: string[] }>;
};

/**
 * The signed-in actor, or null.
 *
 * `cache` makes this one query per request no matter how many components ask.
 * Note that these helpers are a convenience for rendering, not the security
 * boundary — RLS is. If a check here were removed entirely, the database would
 * still return zero rows. Treat a missing guard as a UX bug, not a breach.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  // Called from the site header on every page, so it must survive an
  // unconfigured project: no database means nobody is signed in, not a crash
  // that takes down every route including the homepage.
  if (!isDatabaseConfigured()) return null;

  const supabase = await getSupabaseServerClient();

  // getUser() verifies the JWT with the auth server. getSession() reads the
  // cookie without validating it, which is why it is never used here.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('role, display_name, full_name, avatar_url, preferred_locale, preferred_currency')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileRow) return null;

  const profile = profileRow as unknown as {
    role: string; display_name: string | null; full_name: string | null;
    avatar_url: string | null; preferred_locale: string | null; preferred_currency: string | null;
  };

  const { data: membershipRows } = await supabase
    .from('company_members')
    .select('role, permissions, company:companies!inner ( id, slug, display_name, status )')
    .eq('profile_id', user.id)
    .not('accepted_at', 'is', null);

  const memberships = (membershipRows ?? []) as unknown as Array<{
    role: string; permissions: string[] | null; company: unknown;
  }>;

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role as UserRole,
    displayName: profile.display_name ?? profile.full_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    preferredLocale: (profile.preferred_locale ?? DEFAULT_LOCALE) as Locale,
    preferredCurrency: profile.preferred_currency ?? 'AED',
    companies: memberships
      .map((row) => {
        const company = row.company as never as { id: string; slug: string; display_name: string; status: string };
        return {
          id: company.id,
          slug: company.slug,
          name: company.display_name,
          status: company.status,
          role: row.role as UserRole,
          permissions: row.permissions ?? [],
        };
      })
      // A suspended company disappears from the switcher rather than showing a
      // dashboard whose every action will be refused.
      .filter((company) => company.status === 'active'),
  };
});

export async function requireActor(locale: Locale, next: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    redirect(`${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/sign-in?next=${encodeURIComponent(next)}`);
  }
  return actor;
}

const STAFF: UserRole[] = ['editor', 'support', 'admin', 'super_admin'];
const ADMIN: UserRole[] = ['admin', 'super_admin'];

export const isStaff = (actor: Actor | null) => !!actor && STAFF.includes(actor.role);
export const isAdmin = (actor: Actor | null) => !!actor && ADMIN.includes(actor.role);

export async function requireAdmin(locale: Locale, next: string): Promise<Actor> {
  const actor = await requireActor(locale, next);
  // 404 rather than 403: an admin URL should not confirm it exists to someone
  // probing for one.
  if (!isAdmin(actor)) redirect(`${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/404`);
  return actor;
}

/**
 * Resolves which company the current request is acting for, and refuses if
 * the actor isn't a member. Staff pass through so support can open a
 * supplier's dashboard to help — and `audit_logs` records that they did.
 */
export async function requireCompany(locale: Locale, companyId: string, next: string) {
  const actor = await requireActor(locale, next);
  const membership = actor.companies.find((company) => company.id === companyId);

  if (!membership && !isStaff(actor)) {
    redirect(`${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/404`);
  }
  return { actor, membership: membership ?? null };
}

export function can(actor: Actor, companyId: string, permission: string) {
  if (isAdmin(actor)) return true;
  const membership = actor.companies.find((company) => company.id === companyId);
  if (!membership) return false;
  return membership.role === 'company_owner' || membership.permissions.includes(permission);
}

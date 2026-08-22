import Link from 'next/link';
import { Globe, User } from 'lucide-react';
import { getActor } from '@/lib/auth/session';
import { routes } from '@/lib/seo/routes';
import { LOCALES, LOCALE_META, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { signOutAction } from '@/actions/auth';

/**
 * Site header. A Server Component so the signed-in state is correct in the
 * first byte of HTML — a header that flashes "Sign in" and then swaps to a
 * user menu is the most-noticed jank on any logged-in site.
 *
 * The menus are <details>, so navigation and the language switcher work
 * before any JavaScript loads.
 */
export async function SiteHeader({ locale, path }: { locale: Locale; path: string }) {
  const actor = await getActor();
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const home = routes.home(locale);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--salt)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href={routes.home(locale)} className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[var(--text-xl)] font-bold">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-[var(--teal)] text-[var(--text-sm)] text-white">
            TL
          </span>
          <span className="hidden sm:inline">Tour<span className="text-[var(--teal)]">Leads</span></span>
        </Link>

        <nav className="ms-auto flex items-center gap-1" aria-label="Main">
          <Link href={`${home}#how-it-works`} className="hidden rounded-[var(--radius-pill)] px-3 py-2 text-[var(--text-sm)] font-medium hover:bg-[var(--limestone)] lg:inline-block">
            How it works
          </Link>
          <Link
            href={`${home}#lead-types`}
            className="hidden rounded-[var(--radius-pill)] px-3 py-2 text-[var(--text-sm)] font-medium hover:bg-[var(--limestone)] lg:inline-block"
          >
            Lead types
          </Link>
          <Link
            href={`${home}#pricing`}
            className="hidden rounded-[var(--radius-pill)] px-3 py-2 text-[var(--text-sm)] font-medium hover:bg-[var(--limestone)] lg:inline-block"
          >
            Pricing
          </Link>

          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-[var(--radius-pill)] px-3 py-2 text-[var(--text-sm)] hover:bg-[var(--limestone)]">
              <Globe className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{LOCALE_META[locale].native}</span>
            </summary>
            <ul className="absolute end-0 z-50 mt-2 w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] shadow-[var(--shadow-lift)]">
              {LOCALES.map((option) => (
                <li key={option}>
                  {/* Switching language keeps you on the same page. Dumping
                      people on the homepage is the classic i18n annoyance. */}
                  <Link
                    href={localiseCurrentPath(path, option)}
                    hrefLang={option}
                    className={`block px-4 py-2 text-[var(--text-sm)] hover:bg-[var(--limestone)] ${
                      option === locale ? 'font-semibold text-[var(--teal)]' : ''
                    }`}
                  >
                    {LOCALE_META[option].native}
                    <span className="ms-2 text-[var(--text-xs)] text-[var(--ink-faint)]">{LOCALE_META[option].label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>

          {actor ? (
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--text-sm)]">
                <User className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{actor.displayName?.split(' ')[0] ?? 'Account'}</span>
              </summary>
              <ul className="absolute end-0 z-50 mt-2 w-52 overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] shadow-[var(--shadow-lift)]">
                <li><Link href={`${prefix}/account`} className="block px-4 py-2 text-[var(--text-sm)] hover:bg-[var(--limestone)]">My bookings</Link></li>
                {actor.companies.map((company) => (
                  <li key={company.id}>
                    <Link href={`${prefix}/dashboard/${company.slug}`} className="block px-4 py-2 text-[var(--text-sm)] hover:bg-[var(--limestone)]">
                      {company.name} dashboard
                    </Link>
                  </li>
                ))}
                {['admin', 'super_admin'].includes(actor.role) && (
                  <li><Link href={`${prefix}/admin/applications`} className="block px-4 py-2 text-[var(--text-sm)] hover:bg-[var(--limestone)]">Admin</Link></li>
                )}
                <li className="border-t border-[var(--hairline)]">
                  <form action={signOutAction}>
                    <button type="submit" className="w-full px-4 py-2 text-start text-[var(--text-sm)] hover:bg-[var(--limestone)]">
                      Sign out
                    </button>
                  </form>
                </li>
              </ul>
            </details>
          ) : (
            <Link
              href={`${prefix}/sign-in`}
              className="hidden rounded-[var(--radius-pill)] px-3 py-2 text-[var(--text-sm)] font-semibold hover:bg-[var(--limestone)] sm:inline-block"
            >
              Operator login
            </Link>
          )}
          <Link href={`${home}#lead-form`} className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-4 py-2 text-[var(--text-sm)] font-semibold text-white transition-colors hover:bg-[var(--teal-deep)]">
            Get leads
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Swaps the locale prefix on the current path, preserving the rest. */
function localiseCurrentPath(path: string, target: Locale) {
  const segments = path.split('/').filter(Boolean);
  const first = segments[0];
  const rest = LOCALES.includes(first as Locale) ? segments.slice(1) : segments;
  const tail = rest.join('/');
  return target === DEFAULT_LOCALE ? `/${tail}` : `/${target}${tail ? `/${tail}` : ''}`;
}

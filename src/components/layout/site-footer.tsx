import Link from 'next/link';
import { routes } from '@/lib/seo/routes';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

const COUNTRIES = [
  { name: 'United Arab Emirates', slug: 'united-arab-emirates' },
  { name: 'Saudi Arabia', slug: 'saudi-arabia' },
  { name: 'Qatar', slug: 'qatar' },
  { name: 'Oman', slug: 'oman' },
  { name: 'Bahrain', slug: 'bahrain' },
  { name: 'Kuwait', slug: 'kuwait' },
];

const CITIES = [
  { name: 'Dubai', country: 'united-arab-emirates', slug: 'dubai' },
  { name: 'Abu Dhabi', country: 'united-arab-emirates', slug: 'abu-dhabi' },
  { name: 'Riyadh', country: 'saudi-arabia', slug: 'riyadh' },
  { name: 'AlUla', country: 'saudi-arabia', slug: 'alula' },
  { name: 'Doha', country: 'qatar', slug: 'doha' },
  { name: 'Muscat', country: 'oman', slug: 'muscat' },
];

/**
 * Footer. Beyond the legal links, this is the site's internal-linking spine:
 * every page links to every launch destination, which is how new city pages
 * get discovered and crawled without waiting on a sitemap ping.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-[var(--hairline)] bg-[var(--limestone)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <p className="font-[family-name:var(--font-display)] text-[var(--text-xl)] font-bold">
            TravelHub<span className="text-[var(--teal)]"> Gulf</span>
          </p>
          <p className="max-w-xs text-[var(--text-sm)] text-[var(--ink-soft)]">
            Tours, tickets and experiences across the Gulf, from licensed operators we verify
            before they go live.
          </p>
        </div>

        <FooterColumn title="Countries">
          {COUNTRIES.map((country) => (
            <FooterLink key={country.slug} href={routes.country(locale, country.slug)}>
              {country.name}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Popular cities">
          {CITIES.map((city) => (
            <FooterLink key={city.slug} href={routes.thingsToDo(locale, city.country, city.slug)}>
              Things to do in {city.name}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Company">
          <FooterLink href={`${prefix}/partner/apply`}>List your business</FooterLink>
          <FooterLink href={routes.search(locale)}>Search experiences</FooterLink>
          <FooterLink href={`${prefix}/sign-in`}>Sign in</FooterLink>
        </FooterColumn>
      </div>

      <div className="border-t border-[var(--hairline)]">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[var(--text-xs)] text-[var(--ink-faint)]">
          © {year} TravelHub Gulf. Prices include VAT where applicable.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-[var(--text-sm)] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]">
        {title}
      </h2>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </nav>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--teal)] hover:underline">
        {children}
      </Link>
    </li>
  );
}

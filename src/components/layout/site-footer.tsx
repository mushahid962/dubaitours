import Link from 'next/link';
import { routes } from '@/lib/seo/routes';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export function SiteFooter({ locale }: { locale: Locale }) {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const home = routes.home(locale);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--hairline)] bg-[var(--limestone)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <p className="font-[family-name:var(--font-display)] text-[var(--text-xl)] font-bold">
            Tour<span className="text-[var(--teal)]">Leads</span>
          </p>
          <p className="max-w-xs text-[var(--text-sm)] text-[var(--ink-soft)]">
            High-intent, exclusive traveller enquiries for UAE tour operators.
            Less chasing, more bookings.
          </p>
        </div>

        <FooterColumn title="Product">
          <FooterLink href={`${home}#how-it-works`}>How it works</FooterLink>
          <FooterLink href={`${home}#lead-types`}>Lead types</FooterLink>
          <FooterLink href={`${home}#pricing`}>Pricing</FooterLink>
        </FooterColumn>

        <FooterColumn title="Coverage">
          <FooterLink href={`${home}#lead-types`}>Dubai tour leads</FooterLink>
          <FooterLink href={`${home}#lead-types`}>Abu Dhabi tour leads</FooterLink>
          <FooterLink href={`${home}#lead-types`}>Premium activities</FooterLink>
        </FooterColumn>

        <FooterColumn title="Company">
          <FooterLink href={`${home}#faq`}>FAQs</FooterLink>
          <FooterLink href={`${home}#lead-form`}>Request sample leads</FooterLink>
          <FooterLink href={`${prefix}/sign-in`}>Operator login</FooterLink>
        </FooterColumn>
      </div>

      <div className="border-t border-[var(--hairline)]">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[var(--text-xs)] text-[var(--ink-faint)]">
          © {year} TourLeads. Built for ambitious UAE experience operators.
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

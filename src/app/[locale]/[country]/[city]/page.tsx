import { redirect } from 'next/navigation';
import { routes } from '@/lib/seo/routes';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config';

/**
 * `/uae/dubai` and `/uae/dubai/things-to-do` would be two URLs answering the
 * same intent, splitting link equity and handing Google a duplicate to pick
 * between. A permanent redirect consolidates them onto the page that ranks.
 */
export default async function CityHubPage({
  params,
}: { params: Promise<{ locale: string; country: string; city: string }> }) {
  const { locale: raw, country, city } = await params;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  redirect(routes.thingsToDo(locale, country, city));
}

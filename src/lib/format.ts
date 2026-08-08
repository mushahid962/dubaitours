import type { Locale } from '@/lib/i18n/config';

/** Gulf currencies carry three decimals; the rest carry two. */
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR']);

export function formatMoney(amount: number, currency: string, locale: Locale = 'en') {
  const digits = THREE_DECIMAL.has(currency) ? 3 : 2;
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatDuration(minutes: number, locale: Locale = 'en') {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const rtf = new Intl.NumberFormat(localeTag(locale));

  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${rtf.format(days)} ${days === 1 ? 'day' : 'days'}`;
  }
  if (!hours) return `${rtf.format(minutes)} min`;
  return rest ? `${rtf.format(hours)}h ${rtf.format(rest)}m` : `${rtf.format(hours)} hours`;
}

export function formatDate(iso: string, locale: Locale = 'en', timeZone = 'Asia/Dubai') {
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short', day: 'numeric', month: 'short', timeZone,
  }).format(new Date(iso));
}

/** Arabic numerals stay Latin in prices: Gulf travellers expect AED 149. */
const localeTag = (locale: Locale) =>
  ({ en: 'en-AE', ar: 'ar-AE-u-nu-latn', hi: 'hi-IN', ur: 'ur-PK' }[locale] ?? 'en-AE');

export const LOCALES = ['en', 'ar', 'hi', 'ur'] as const;
export const FUTURE_LOCALES = ['fr', 'ru', 'de', 'zh'] as const;
export const DEFAULT_LOCALE = 'en' satisfies Locale;
export const RTL_LOCALES = new Set(['ar', 'ur']);

export type Locale = (typeof LOCALES)[number];

export const LOCALE_META: Record<Locale, { label: string; native: string; hreflang: string }> = {
  en: { label: 'English', native: 'English', hreflang: 'en' },
  ar: { label: 'Arabic', native: 'العربية', hreflang: 'ar' },
  hi: { label: 'Hindi', native: 'हिन्दी', hreflang: 'hi' },
  ur: { label: 'Urdu', native: 'اردو', hreflang: 'ur' },
};

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

export const dirFor = (locale: Locale) => (RTL_LOCALES.has(locale) ? 'rtl' : 'ltr');

/**
 * Country -> default locale. Used to pick a first guess for visitors who
 * arrive without a locale prefix; the choice is always overridable and is
 * never used to hard-redirect a crawler.
 */
export const COUNTRY_LOCALE_HINT: Record<string, Locale> = {
  AE: 'en', SA: 'ar', QA: 'ar', OM: 'ar', BH: 'ar', KW: 'ar',
  IN: 'hi', PK: 'ur', GB: 'en', US: 'en',
};

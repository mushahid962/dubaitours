import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { COUNTRY_LOCALE_HINT, DEFAULT_LOCALE, LOCALES, isLocale } from '@/lib/i18n/config';

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|js|css|woff2?)$/;
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/account'];

// Which roles may enter which area. Checked at the edge so a mis-routed link
// fails in one hop instead of rendering a page that RLS will empty out.
// This is routing, not security: RLS is the boundary, and removing this
// would leak nothing.
const AREA_ROLES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/admin', roles: ['content_manager', 'booking_manager', 'support_agent', 'admin', 'super_admin'] },
  { prefix: '/dashboard', roles: ['business_owner', 'business_staff', 'tour_operator', 'hotel_manager',
                                  'content_manager', 'booking_manager', 'support_agent', 'admin', 'super_admin'] },
];

/**
 * Next 16 renamed this file convention from `middleware` to `proxy`. Same
 * behaviour, same export shape — only the filename and function name changed.
 *
 * Runs on every request at the edge. Three jobs, in order:
 *   1. resolve the locale without ever redirecting a crawler in a loop
 *   2. refresh the Supabase session cookie
 *   3. gate the authenticated areas before any page code runs
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split('/').filter(Boolean);
  const maybeLocale = segments[0];
  const hasLocalePrefix = maybeLocale ? isLocale(maybeLocale) : false;

  // The default locale is canonical without a prefix. /en/dubai is a
  // permanent redirect to /dubai so only one URL is ever indexed.
  if (hasLocalePrefix && maybeLocale === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = `/${segments.slice(1).join('/')}`;
    return NextResponse.redirect(url, 308);
  }

  const locale = hasLocalePrefix ? maybeLocale! : DEFAULT_LOCALE;

  // English is served without a prefix, but the pages all live under
  // src/app/[locale]/. So `/uae/dubai` is REWRITTEN to `/en/uae/dubai`
  // internally — the visitor's URL never changes, and there is only one
  // page tree to maintain. Without this, every unprefixed URL 404s.
  const rewriteUrl = hasLocalePrefix ? null : (() => {
    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
    return url;
  })();

  let response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: request.headers } })
    : NextResponse.next({ request: { headers: request.headers } });
  response.headers.set('x-thg-locale', locale);
  response.headers.set('x-thg-pathname', pathname);

  // Without Supabase configured there is no session to refresh and nobody to
  // gate, so the request passes straight through. This is what lets a fresh
  // clone run before any setup — the alternative is a 500 on every page.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: Array<{ name: string; value: string; options: CookieOptions }>) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request: { headers: request.headers } })
            : NextResponse.next({ request: { headers: request.headers } });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const strippedPath = hasLocalePrefix ? `/${segments.slice(1).join('/')}` : pathname;

  // SHORT-FORM DIRECTORY URLS
  //
  // /dubai/hotels was in the brief alongside /uae/dubai/hotels. Serving both
  // would split every ranking signal between two URLs for one page. So the
  // short form resolves here and 301s into the canonical, which means the
  // convenient URL works and only one URL accumulates authority.
  //
  // City slugs are globally unique per locale (enforced by an index), so the
  // lookup is unambiguous.
  const dirSegments = strippedPath.split('/').filter(Boolean);
  const COUNTRY_SLUGS = new Set([
    'united-arab-emirates', 'uae', 'saudi-arabia', 'qatar', 'oman', 'bahrain', 'kuwait',
  ]);
  const RESERVED = new Set([
    'destinations', 'search', 'admin', 'dashboard', 'account', 'sign-in', 'sign-up',
    'setup', 'partner', 'callback', 'api', 'sitemaps', 'robots.txt', 'tour', 'operator',
    'checkout', 'booking', 'guide', 'forgot-password', 'reset-password', 'verify-email',
  ]);

  if (
    supabaseUrl && supabaseKey &&
    dirSegments.length >= 2 &&
    !COUNTRY_SLUGS.has(dirSegments[0]) &&
    !RESERVED.has(dirSegments[0])
  ) {
    const { data: city } = await supabase
      .from('city_translations')
      .select('slug, city:cities!inner ( country:countries!inner ( translations:country_translations ( locale, slug ) ) )')
      .eq('locale', locale)
      .eq('slug', dirSegments[0])
      .maybeSingle();

    const countrySlug = (city as { city?: { country?: { translations?: Array<{ locale: string; slug: string }> } } } | null)
      ?.city?.country?.translations?.find((t) => t.locale === locale)?.slug;

    if (countrySlug) {
      const url = request.nextUrl.clone();
      url.pathname = `${hasLocalePrefix ? `/${locale}` : ''}/${countrySlug}/${dirSegments.join('/')}`;
      return NextResponse.redirect(url, 301);
    }
  }
  const needsAuth = PROTECTED_PREFIXES.some((prefix) => strippedPath.startsWith(prefix));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = hasLocalePrefix ? `/${locale}/sign-in` : '/sign-in';
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  if (needsAuth && user) {
    const { data: profile } = await supabase
      .from('profiles').select('role, status').eq('id', user.id).maybeSingle();

    const row = profile as { role: string; status: string } | null;

    // Status before role. A suspended admin is not an admin, and checking
    // role first would let them through to a page that then has to undo it.
    if (row?.status === 'suspended' || row?.status === 'banned') {
      const url = request.nextUrl.clone();
      url.pathname = hasLocalePrefix ? `/${locale}/account/suspended` : '/account/suspended';
      url.search = '';
      if (!strippedPath.startsWith('/account/suspended')) return NextResponse.redirect(url);
    }

    if (row?.status === 'pending_verification' && !strippedPath.startsWith('/verify-email')) {
      const url = request.nextUrl.clone();
      url.pathname = hasLocalePrefix ? `/${locale}/verify-email` : '/verify-email';
      url.search = '';
      return NextResponse.redirect(url);
    }

    const area = AREA_ROLES.find((rule) => strippedPath.startsWith(rule.prefix));
    if (area && row && !area.roles.includes(row.role)) {
      // Rewrite to 404 rather than redirect: a redirect to /404 confirms the
      // admin area exists to whoever just probed for it.
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/404`;
      return NextResponse.rewrite(url, { status: 404 });
    }
  }

  // First-time visitors with no locale preference get a suggestion header,
  // which the client turns into a dismissible banner. Never an auto-redirect:
  // geo-redirecting crawlers is how sites lose their non-English index.
  if (!hasLocalePrefix && !request.cookies.get('thg-locale')) {
    const country = request.headers.get('x-vercel-ip-country');
    const suggested = country ? COUNTRY_LOCALE_HINT[country] : undefined;
    if (suggested && suggested !== DEFAULT_LOCALE) {
      response.headers.set('x-thg-suggest-locale', suggested);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

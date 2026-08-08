import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { COUNTRY_LOCALE_HINT, DEFAULT_LOCALE, LOCALES, isLocale } from '@/lib/i18n/config';

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|js|css|woff2?)$/;
const DASHBOARD_PREFIXES = ['/dashboard', '/admin', '/account'];

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
  const needsAuth = DASHBOARD_PREFIXES.some((prefix) => strippedPath.startsWith(prefix));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = hasLocalePrefix ? `/${locale}/sign-in` : '/sign-in';
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
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

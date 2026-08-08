import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client is intentionally loosely typed until you generate real
 * types from your own database:
 *
 *     npm run db:types
 *
 * That command overwrites src/types/database.generated.ts with the true
 * schema, and you can then swap `any` below for `Database` to get full
 * autocomplete and compile-time checking on every column name. Until then,
 * loose typing is honest — a placeholder type that pretends to check things
 * it cannot is worse than no type at all.
 */
export type Db = SupabaseClient<any, 'public', any>;

/**
 * Request-scoped client. Carries the user's JWT, so every query is filtered
 * by RLS. Use this for anything a signed-in person is allowed to see.
 */
/** True once Supabase env vars exist. Pages use it to show demo content. */
export const isDatabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<any, 'public', any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items: Array<{ name: string; value: string; options: CookieOptions }>) => {
          try {
            items.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render pass; middleware refreshes
            // the session instead, so swallowing this is correct.
          }
        },
      },
    },
  );
}

/**
 * Anonymous client for public catalog reads during ISR/static generation,
 * where there is no request context and therefore no cookies.
 */
export function getSupabasePublicClient() {
  return createClient<any, 'public', any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only three callers are allowed: payment webhooks, background jobs, and
 * admin mutations that have already passed an explicit role check. Never
 * import this into a component or a route that echoes user input.
 */
export function getSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');

  return createClient<any, 'public', any>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-thg-context': 'service-role' } },
  });
}

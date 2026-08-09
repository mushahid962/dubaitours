'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import { passwordSchema } from '@/schemas/auth';

export type SetupState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

const setupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().email('Enter a valid email address.').max(160),
  password: passwordSchema,
  confirmPassword: z.string(),
  token: z.string().trim().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Those passwords do not match.', path: ['confirmPassword'],
});

/**
 * First-run setup: creates the one super admin account.
 *
 * Runs with the service role, because the person doing this has no privileges
 * yet by definition. That makes the guards below the entire security
 * boundary, so they fail closed:
 *
 *   - refuses outright once any super admin exists
 *   - `bootstrap_super_admin` re-checks under an advisory lock, so two
 *     simultaneous requests cannot both win
 *   - an optional SETUP_TOKEN must match when set
 *   - rate limited, and every attempt is recorded
 */
export async function completeSetupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Connect Supabase first — see docs/DATABASE-SETUP.md.' };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const limit = await checkRateLimit('auth', rateLimitIdentity(null, ip));
  if (!limit.success) {
    return { status: 'error', message: 'Too many attempts. Wait a few minutes.' };
  }

  const parsed = setupSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    token: formData.get('token') ?? '',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const admin = getSupabaseAdminClient();

  // First gate: cheap, and closes the page for everyone after the first run.
  const { data: alreadyDone } = await admin.rpc('is_setup_complete');
  if (alreadyDone) {
    await recordRejection(admin, parsed.data.email, ip, 'setup already completed');
    return {
      status: 'error',
      message: 'Setup has already been completed. Ask an existing super admin for access.',
    };
  }

  // Second gate, optional. Useful when the site is already public before you
  // have claimed the account — the window between deploying and running setup
  // is otherwise a race with anyone who finds the URL.
  const expectedToken = process.env.SETUP_TOKEN;
  if (expectedToken && parsed.data.token !== expectedToken) {
    await recordRejection(admin, parsed.data.email, ip, 'bad setup token');
    return { status: 'error', message: 'That setup token is not correct.' };
  }

  // Created with the admin API and email_confirm, because the account has to
  // be usable immediately — waiting on an email that may be filtered would
  // leave the platform with no administrator.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createError || !created.user) {
    console.error('[setup] createUser failed', createError);

    // Surfacing the real error here is deliberate. This page exists only
    // before any account does, so there is nothing to leak — and "check the
    // logs" is useless advice to someone who cannot reach the logs. Each
    // known cause gets the fix, not just the symptom.
    const raw = createError?.message ?? 'Unknown error';

    if (/already|registered|exists/i.test(raw)) {
      return {
        status: 'error',
        message: `An account already exists for that email. Use a different address, or delete the user in Supabase → Authentication → Users and try again. (${raw})`,
      };
    }
    if (/password/i.test(raw)) {
      return {
        status: 'error',
        message: `Supabase rejected the password: ${raw}. Check Authentication → Providers → Email for the minimum length set on your project.`,
      };
    }
    if (/database error|unexpected_failure/i.test(raw)) {
      return {
        status: 'error',
        message: `The database rejected the new user: ${raw}. This is almost always the handle_new_user trigger. Run part-1-schema.sql and part-2-schema.sql again, then check Supabase → Logs → Postgres for the underlying error.`,
      };
    }
    if (/not authorized|invalid|jwt|api key/i.test(raw)) {
      return {
        status: 'error',
        message: `Supabase refused the request: ${raw}. Your SUPABASE_SERVICE_ROLE_KEY is probably wrong or is the anon key. Copy the service_role secret from Project Settings → API, update it in Vercel, and REDEPLOY.`,
      };
    }
    if (/signup|disabled|not allowed/i.test(raw)) {
      return {
        status: 'error',
        message: `Sign-ups are disabled on your Supabase project: ${raw}. Turn them on under Authentication → Providers → Email.`,
      };
    }

    return { status: 'error', message: `Supabase said: ${raw}` };
  }

  const { error: bootstrapError } = await admin.rpc('bootstrap_super_admin', {
    p_profile_id: created.user.id,
    p_ip: ip,
  });

  if (bootstrapError) {
    // Lost the race, or setup completed between the two checks. Remove the
    // half-made account rather than leaving an orphan that can sign in.
    await admin.auth.admin.deleteUser(created.user.id);
    await recordRejection(admin, parsed.data.email, ip, bootstrapError.message);
    return {
      status: 'error',
      message: bootstrapError.message.replace(/^.*ERROR:\s*/, ''),
    };
  }

  redirect('/sign-in?setup=complete');
}

/**
 * Rejections are logged here rather than inside the database function,
 * because a row written immediately before a RAISE is rolled back with it.
 */
async function recordRejection(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  email: string, ip: string | null, reason: string,
) {
  await admin.from('audit_logs').insert({
    action: 'setup.rejected',
    entity_type: 'profile',
    after: { email, reason },
    ip,
  });
}

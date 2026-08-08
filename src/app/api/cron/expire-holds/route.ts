import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Releases seats from abandoned checkouts. Scheduled every minute.
 *
 * The work happens in `expire_stale_holds()`, which takes `FOR UPDATE SKIP
 * LOCKED` so overlapping runs cannot double-release the same booking.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');

  // An unauthenticated cron endpoint is a free denial-of-service: anyone who
  // finds the URL can hammer it. Vercel Cron sends this header automatically.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { data, error } = await getSupabaseAdminClient().rpc('expire_stale_holds');

  if (error) {
    console.error('[cron] expire-holds failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }

  return NextResponse.json({ released: data ?? 0, at: new Date().toISOString() });
}

'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, isStaff } from '@/lib/auth/session';
import { invalidateTags } from '@/lib/cache/redis';

export type TourReviewState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const schema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), tourId: z.string().uuid(), note: z.string().trim().max(1000).optional() }),
  z.object({
    decision: z.literal('reject'), tourId: z.string().uuid(),
    reason: z.string().trim().min(15, 'Say specifically what needs fixing — a vague rejection just comes back unchanged.').max(1000),
  }),
]);

export async function reviewTourAction(_prev: TourReviewState, formData: FormData): Promise<TourReviewState> {
  const actor = await getActor();
  if (!isStaff(actor)) return { status: 'error', message: 'You do not have access to that queue.' };

  const parsed = schema.safeParse({
    decision: formData.get('decision'),
    tourId: formData.get('tourId'),
    note: formData.get('note') || undefined,
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: slugRows } = await supabase
    .from('tour_translations').select('slug').eq('tour_id', parsed.data.tourId);
  const slugs = ((slugRows ?? []) as unknown as Array<{ slug: string }>).map((r) => r.slug);

  const { error } = parsed.data.decision === 'approve'
    ? await supabase.rpc('approve_tour', { p_tour_id: parsed.data.tourId, p_note: parsed.data.note ?? null })
    : await supabase.rpc('reject_tour', { p_tour_id: parsed.data.tourId, p_reason: parsed.data.reason });

  if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };

  // Approval puts a new page into the index; both decisions change what the
  // supplier sees. Clear every cache that could still show the old state.
  await invalidateTags(...slugs.map((s) => `tour:${s}`), 'sitemap', 'home');
  for (const slug of slugs) revalidateTag(`tour:${slug}`, 'max');
  revalidatePath('/admin/tours');
  revalidatePath('/dashboard');

  return {
    status: 'done',
    message: parsed.data.decision === 'approve'
      ? 'Published. It is live and will appear in the next sitemap.'
      : 'Sent back to the operator with your notes.',
  };
}

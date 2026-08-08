'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { invalidateTags } from '@/lib/cache/redis';

export type ReplyState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const schema = z.object({
  reviewId: z.string().uuid(),
  reply: z.string().trim()
    .min(20, 'A one-line reply reads worse than none. Say what you did about it.')
    .max(1500),
  slug: z.string().optional(),
});

export async function replyToReviewAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const parsed = schema.safeParse({
    reviewId: formData.get('reviewId'),
    reply: formData.get('reply'),
    slug: formData.get('slug') || undefined,
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check your reply.' };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('reply_to_review', {
    p_review_id: parsed.data.reviewId, p_reply: parsed.data.reply,
  });

  if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };

  // The reply is public, so the cached tour page has to go.
  if (parsed.data.slug) {
    await invalidateTags(`tour:${parsed.data.slug}`);
    revalidateTag(`tour:${parsed.data.slug}`, 'max');
  }
  revalidatePath('/dashboard');
  return { status: 'done', message: 'Reply published on the listing.' };
}

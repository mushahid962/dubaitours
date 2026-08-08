'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, isStaff } from '@/lib/auth/session';
import type { ContentState } from '@/actions/content-editor';

export type { ContentState };

const schema = z.object({
  menuId: z.string().uuid(),
  items: z.array(z.object({
    id: z.string(),
    href: z.string().trim().min(1, 'Every item needs a link.').max(300),
    position: z.coerce.number().int().min(0),
    labels: z.record(z.string(), z.string().trim().max(80)),
    badge: z.string().trim().max(20).optional().or(z.literal('')),
    rel: z.string().trim().max(40).optional().or(z.literal('')),
    isVisible: z.boolean(),
  })).max(60),
});

export async function saveMenuAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await getActor();
  if (!isStaff(actor)) return { status: 'error', message: 'You do not have permission to edit menus.' };

  let items: unknown = [];
  try { items = JSON.parse(String(formData.get('items') ?? '[]')); }
  catch { return { status: 'error', message: 'Could not read those items.' }; }

  const parsed = schema.safeParse({ menuId: formData.get('menuId'), items });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the menu items.' };
  }

  // Every item must have an English label: it is the fallback every other
  // language falls back to, so a missing one leaves a blank link.
  const missing = parsed.data.items.find((item) => !item.labels.en?.trim());
  if (missing) {
    return { status: 'error', message: `"${missing.href}" needs an English label — it is the fallback for every other language.` };
  }

  const supabase = await getSupabaseServerClient();

  // Replace wholesale. Menus are small and ordering matters, so diffing buys
  // nothing but a chance to leave the list half-updated.
  await supabase.from('navigation_items').delete().eq('menu_id', parsed.data.menuId);

  if (parsed.data.items.length) {
    const { error } = await supabase.from('navigation_items').insert(
      parsed.data.items.map((item, index) => ({
        menu_id: parsed.data.menuId,
        position: index,
        href: item.href,
        labels: item.labels,
        badge: item.badge || null,
        rel: item.rel || null,
        is_visible: item.isVisible,
      })),
    );
    if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };
  }

  revalidatePath('/', 'layout');
  return { status: 'saved', message: `Saved ${parsed.data.items.length} items.` };
}

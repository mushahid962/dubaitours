'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, can, isSuperAdmin } from '@/lib/auth/session';
import { assignRoleSchema, accountStatusSchema } from '@/schemas/auth';

export type UserAdminState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

/**
 * Change a user's role.
 *
 * The check here is a fast path with a clear message. The real enforcement is
 * inside `assign_role()`, which refuses a non-super-admin, refuses a self
 * change, protects the last super admin, and writes an audit entry — none of
 * which an UPDATE statement could express.
 */
export async function assignRoleAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const actor = await getActor();
  if (!isSuperAdmin(actor)) {
    return { status: 'error', message: 'Only a super admin can change roles.' };
  }

  const parsed = assignRoleSchema.safeParse({
    profileId: formData.get('profileId'),
    role: formData.get('role'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('assign_role', {
    p_profile_id: parsed.data.profileId,
    p_role: parsed.data.role,
    p_reason: parsed.data.reason,
  });

  if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };

  revalidatePath('/admin/team');
  return { status: 'done', message: `Role changed to ${parsed.data.role.replace(/_/g, ' ')}.` };
}

export async function setAccountStatusAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const actor = await getActor();
  if (!can(actor, 'users.suspend')) {
    return { status: 'error', message: 'You do not have permission to change account status.' };
  }

  const parsed = accountStatusSchema.safeParse({
    profileId: formData.get('profileId'),
    status: formData.get('status'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('set_account_status', {
    p_profile_id: parsed.data.profileId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };

  revalidatePath('/admin/team');
  return {
    status: 'done',
    message: parsed.data.status === 'active'
      ? 'Account reinstated.'
      : `Account ${parsed.data.status}. They lose every permission on their next request.`,
  };
}

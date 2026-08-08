'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, isAdmin, isStaff } from '@/lib/auth/session';
import { reviewApplicationSchema } from '@/schemas/company-application';
import { invalidateTags } from '@/lib/cache/redis';

export type ReviewState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

/**
 * Admin decision on a partner application.
 *
 * The role check here is a fast path and a clearer error message. The real
 * enforcement is inside `approve_company_application`, which raises
 * insufficient_privilege for a non-admin caller even though it is a definer
 * function — a definer function without its own check is an escalation hole.
 */
export async function reviewApplicationAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const actor = await getActor();
  if (!isStaff(actor)) return { status: 'error', message: 'You do not have access to that queue.' };

  const parsed = reviewApplicationSchema.safeParse({
    decision: formData.get('decision'),
    applicationId: formData.get('applicationId'),
    commissionRate: formData.get('commissionRate'),
    note: formData.get('note') || undefined,
    reason: formData.get('reason'),
    message: formData.get('message'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await getSupabaseServerClient();

  if (parsed.data.decision === 'approve') {
    // Approval creates a company and changes a person's role. Editors and
    // support staff can triage the queue but cannot make this call.
    if (!isAdmin(actor)) {
      return { status: 'error', message: 'Only an administrator can approve an operator.' };
    }

    const { data, error } = await supabase.rpc('approve_company_application', {
      p_application_id: parsed.data.applicationId,
      p_commission_rate: parsed.data.commissionRate,
      p_note: parsed.data.note ?? null,
    });

    if (error) return { status: 'error', message: cleanError(error.message) };

    await invalidateTags('sitemap');
    revalidatePath('/admin/applications');
    const company = data as { display_name?: string; slug?: string } | null;
    return { status: 'done', message: `${company?.display_name ?? 'Operator'} approved and live at /operator/${company?.slug ?? ''}.` };
  }

  if (parsed.data.decision === 'reject') {
    const { error } = await supabase.rpc('reject_company_application', {
      p_application_id: parsed.data.applicationId,
      p_reason: parsed.data.reason,
    });
    if (error) return { status: 'error', message: cleanError(error.message) };

    revalidatePath('/admin/applications');
    return { status: 'done', message: 'Application rejected. The applicant has been told why.' };
  }

  const { error } = await supabase.rpc('request_application_info', {
    p_application_id: parsed.data.applicationId,
    p_message: parsed.data.message,
  });
  if (error) return { status: 'error', message: cleanError(error.message) };

  revalidatePath('/admin/applications');
  return { status: 'done', message: 'Sent back to the applicant with your notes.' };
}

/** Postgres prefixes its exceptions; the applicant-facing text is the useful part. */
const cleanError = (message: string) => message.replace(/^.*ERROR:\s*/, '').trim();

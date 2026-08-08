'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type RedeemState =
  | { status: 'idle' }
  | { status: 'checked_in'; guestName: string; reference: string; seats: number; alreadyRedeemed: boolean; redeemedAt: string }
  | { status: 'error'; message: string };

export async function redeemTicketAction(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const code = String(formData.get('ticketCode') ?? '').trim();
  if (!code) return { status: 'error', message: 'Enter a ticket code.' };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('redeem_ticket', { p_ticket_code: code });

  if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };

  const row = (Array.isArray(data) ? data[0] : data) as unknown as {
    reference: string; guest_name: string; seats: number;
    already_redeemed: boolean; redeemed_at: string;
  } | null;

  if (!row) return { status: 'error', message: 'No booking matches that ticket.' };

  revalidatePath('/dashboard');
  return {
    status: 'checked_in',
    guestName: row.guest_name, reference: row.reference, seats: row.seats,
    alreadyRedeemed: row.already_redeemed, redeemedAt: row.redeemed_at,
  };
}

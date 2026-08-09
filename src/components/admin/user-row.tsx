'use client';

import { useActionState, useState } from 'react';
import { Loader2, BadgeCheck, ShieldAlert } from 'lucide-react';
import { assignRoleAction, setAccountStatusAction, type UserAdminState } from '@/actions/user-admin';
import { ROLE_META, type Role, type AccountStatus } from '@/lib/auth/roles';

type User = {
  id: string; email: string; name: string; role: Role; status: AccountStatus;
  suspendedReason: string | null; verified: boolean; lastLogin: string;
};

const STATUS_COLOUR: Record<AccountStatus, string> = {
  active: 'var(--teal)',
  pending_verification: 'var(--brass)',
  suspended: 'var(--pomegranate)',
  banned: 'var(--pomegranate)',
  deactivated: 'var(--ink-faint)',
};

export function UserRow({ user, canAssign, isSelf }: {
  user: User; canAssign: boolean; isSelf: boolean;
}) {
  const [open, setOpen] = useState<'role' | 'status' | null>(null);
  const [roleState, assignRole, assigning] = useActionState<UserAdminState, FormData>(
    assignRoleAction, { status: 'idle' },
  );
  const [statusState, setStatus, settingStatus] = useActionState<UserAdminState, FormData>(
    setAccountStatusAction, { status: 'idle' },
  );

  const message = roleState.status !== 'idle' ? roleState : statusState;

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {user.name}
            {user.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--teal)]" aria-label="Email verified" />}
            {isSelf && <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">(you)</span>}
          </span>
          <span className="truncate text-[var(--text-xs)] text-[var(--ink-faint)]">
            {user.email} · last seen {user.lastLogin}
          </span>
          {user.suspendedReason && (
            <span className="text-[var(--text-xs)] text-[var(--pomegranate)]">{user.suspendedReason}</span>
          )}
        </div>

        <span className="rounded-full bg-[var(--limestone)] px-2.5 py-0.5 text-[var(--text-xs)]">
          {ROLE_META[user.role]?.label ?? user.role}
        </span>
        <span className="text-[var(--text-xs)] font-medium capitalize" style={{ color: STATUS_COLOUR[user.status] }}>
          {user.status.replace(/_/g, ' ')}
        </span>

        {/* Nobody may act on their own account here — the database refuses it
            too, but hiding the buttons avoids an error nobody needed to see. */}
        {!isSelf && (
          <span className="flex gap-2">
            {canAssign && (
              <button type="button" onClick={() => setOpen(open === 'role' ? null : 'role')}
                className="text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
                Change role
              </button>
            )}
            <button type="button" onClick={() => setOpen(open === 'status' ? null : 'status')}
              className="text-[var(--text-sm)] font-semibold text-[var(--ink-soft)] hover:text-[var(--pomegranate)]">
              {user.status === 'suspended' ? 'Reinstate' : 'Suspend'}
            </button>
          </span>
        )}
      </div>

      {open === 'role' && (
        <form action={assignRole} className="flex flex-wrap items-end gap-2 border-t border-[var(--hairline)] pt-3">
          <input type="hidden" name="profileId" value={user.id} />
          <label className="flex flex-col gap-1 text-[var(--text-xs)]">
            New role
            <select name="role" defaultValue={user.role}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]">
              {Object.entries(ROLE_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[var(--text-xs)]">
            Why (audited)
            <input name="reason" required minLength={5} placeholder="Joined the content team"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]" />
          </label>
          <button type="submit" disabled={assigning}
            className="flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 text-[var(--text-sm)] font-semibold text-white disabled:opacity-60">
            {assigning && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Apply
          </button>
        </form>
      )}

      {open === 'status' && (
        <form action={setStatus} className="flex flex-wrap items-end gap-2 border-t border-[var(--hairline)] pt-3">
          <input type="hidden" name="profileId" value={user.id} />
          <label className="flex flex-col gap-1 text-[var(--text-xs)]">
            Status
            <select name="status" defaultValue={user.status === 'suspended' ? 'active' : 'suspended'}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[var(--text-xs)]">
            Reason (required to suspend or ban)
            <input name="reason" placeholder="Chargeback fraud on three bookings"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]" />
          </label>
          <button type="submit" disabled={settingStatus}
            className="flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--ink)] px-5 text-[var(--text-sm)] font-semibold text-[var(--salt)] disabled:opacity-60">
            {settingStatus && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Apply
          </button>
        </form>
      )}

      {message.status === 'error' && (
        <p role="alert" className="flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--pomegranate)]">
          <ShieldAlert className="h-4 w-4" aria-hidden /> {message.message}
        </p>
      )}
      {message.status === 'done' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{message.message}</p>
      )}
    </li>
  );
}

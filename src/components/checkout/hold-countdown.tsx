'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Live countdown on the seat hold.
 *
 * Honest urgency: these seats really are reserved and really will be released,
 * so the timer reflects a database state rather than manufacturing pressure.
 * When it hits zero the page reloads, because at that point the server's view
 * and the screen no longer agree.
 */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => msLeft(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const next = msLeft(expiresAt);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(timer);
        window.location.reload();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const urgent = remaining < 3 * 60_000;

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-3 text-[var(--text-sm)]"
      style={{
        background: urgent ? 'color-mix(in oklab, var(--pomegranate) 10%, transparent)' : 'var(--teal-wash)',
        color: urgent ? 'var(--pomegranate)' : 'var(--teal-deep)',
      }}
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        We're holding your places for{' '}
        <strong className="tabular-nums">{minutes}:{String(seconds).padStart(2, '0')}</strong>
      </span>
    </p>
  );
}

const msLeft = (iso: string) => Math.max(0, new Date(iso).getTime() - Date.now());

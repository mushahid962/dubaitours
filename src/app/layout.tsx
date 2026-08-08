import type { ReactNode } from 'react';

/**
 * Root layout. Deliberately thin — the real work happens in [locale]/layout,
 * which is where `lang` and `dir` can actually be resolved. This file exists
 * only because Next requires a root, and it renders the html/body shell so
 * the locale layout can stay a plain fragment.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}

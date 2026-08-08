'use client';

import { useActionState, useState } from 'react';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import { saveMenuAction, type ContentState } from '@/actions/menu-editor';

type Item = {
  id: string; href: string; position: number;
  labels: Record<string, string>; badge: string; rel: string; isVisible: boolean;
};

export function MenuEditor({
  menu, locales,
}: { menu: { id: string; key: string; items: Item[] }; locales: string[] }) {
  const [items, setItems] = useState<Item[]>(menu.items);
  const [state, submit, isPending] = useActionState<ContentState, FormData>(
    saveMenuAction, { status: 'idle' },
  );

  const update = (index: number, patch: Partial<Item>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    // Reordering with buttons rather than drag-and-drop: it works on touch,
    // with a keyboard and with a screen reader, and needs no library.
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, i) => ({ ...item, position: i }));
    });
  };

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <input type="hidden" name="menuId" value={menu.id} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <h2 className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
        {menu.key.replace(/_/g, ' ')}
      </h2>

      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--limestone)] p-3">
            <div className="flex items-center gap-2">
              <span className="flex flex-col">
                <button type="button" onClick={() => move(index, -1)} aria-label="Move up"
                  disabled={index === 0} className="text-[var(--ink-faint)] disabled:opacity-30">▲</button>
                <button type="button" onClick={() => move(index, 1)} aria-label="Move down"
                  disabled={index === items.length - 1} className="text-[var(--ink-faint)] disabled:opacity-30">▼</button>
              </span>
              <GripVertical className="h-4 w-4 text-[var(--ink-faint)]" aria-hidden />

              <input value={item.href} onChange={(e) => update(index, { href: e.target.value })}
                placeholder="/united-arab-emirates/dubai/things-to-do" aria-label="Link"
                className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--paper)] px-2 font-[family-name:var(--font-mono)] text-[var(--text-xs)]" />

              <label className="flex items-center gap-1 text-[var(--text-xs)]">
                <input type="checkbox" checked={item.isVisible}
                  onChange={(e) => update(index, { isVisible: e.target.checked })}
                  className="accent-[var(--teal)]" />
                Visible
              </label>

              <button type="button" onClick={() => setItems((c) => c.filter((_, i) => i !== index))}
                aria-label="Remove item" className="text-[var(--ink-faint)] hover:text-[var(--pomegranate)]">
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              {locales.map((code) => (
                <label key={code} className="flex flex-col gap-0.5 text-[var(--text-xs)] text-[var(--ink-faint)]">
                  {code.toUpperCase()}
                  <input value={item.labels[code] ?? ''}
                    onChange={(e) => update(index, { labels: { ...item.labels, [code]: e.target.value } })}
                    placeholder={code === 'en' ? 'Things to do' : item.labels.en ?? ''}
                    className="h-8 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--paper)] px-2 text-[var(--text-sm)] text-[var(--ink)]" />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <button type="button"
        onClick={() => setItems((c) => [...c, {
          id: crypto.randomUUID(), href: '/', position: c.length,
          labels: {}, badge: '', rel: '', isVisible: true,
        }])}
        className="inline-flex w-fit items-center gap-1.5 text-[var(--text-sm)] font-semibold text-[var(--teal)]">
        <Plus className="h-4 w-4" aria-hidden /> Add item
      </button>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-10 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 text-[var(--text-sm)] font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save menu
      </button>
    </form>
  );
}

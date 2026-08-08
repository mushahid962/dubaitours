import { Clock, Wallet, Zap, ShieldCheck, Star, Languages } from 'lucide-react';

type Props = {
  summary: string;
  facts: Array<{ icon: 'duration' | 'price' | 'confirmation' | 'cancellation' | 'rating' | 'languages'; label: string; value: string }>;
};

const ICONS = { duration: Clock, price: Wallet, confirmation: Zap, cancellation: ShieldCheck, rating: Star, languages: Languages };

/**
 * The answer block, directly under the title.
 *
 * Two audiences, one component. A traveller gets the six facts that decide a
 * booking without scrolling. A language model gets a self-contained paragraph
 * with a price, a duration and a date in it — the shape that actually gets
 * quoted and attributed rather than skimmed.
 *
 * The paragraph is generated from live data by `tourAnswerSummary`, so it
 * cannot contradict the booking panel sitting next to it.
 */
export function AnswerSummary({ summary, facts }: Props) {
  return (
    <section aria-label="At a glance" className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <p className="text-[var(--text-base)] leading-relaxed text-[var(--ink)]">{summary}</p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--hairline)] pt-4 md:grid-cols-3">
        {facts.map((fact) => {
          const Icon = ICONS[fact.icon];
          return (
            <div key={fact.label} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--teal)]" aria-hidden />
              <div className="flex flex-col">
                <dt className="text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                  {fact.label}
                </dt>
                <dd className="text-[var(--text-sm)] font-medium text-[var(--ink)]">{fact.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

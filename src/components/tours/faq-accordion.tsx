/**
 * FAQ block.
 *
 * Built on <details>, so every answer is present in the HTML and readable by
 * a crawler or a model without executing any JavaScript. An accordion that
 * hides its answers behind React state is invisible to the thing we most want
 * reading it.
 */
export function FaqAccordion({ faqs, heading }: { faqs: Array<{ question: string; answer: string }>; heading: string }) {
  if (!faqs.length) return null;

  return (
    <section aria-labelledby="faq-heading" className="flex flex-col gap-3">
      <h2 id="faq-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
        {heading}
      </h2>

      <div className="divide-y divide-[var(--hairline)] rounded-[var(--radius-lg)] bg-[var(--paper)] px-5">
        {faqs.map((faq) => (
          <details key={faq.question} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[var(--text-base)] font-semibold">
              {faq.question}
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--hairline)] text-[var(--ink-soft)] transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="pt-2 text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

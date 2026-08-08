/**
 * Skeleton matched to the real layout's dimensions, so nothing shifts when
 * the content arrives. A spinner would be simpler and would cost CLS.
 */
export default function TourLoading() {
  return (
    <div className="mx-auto flex max-w-6xl animate-pulse flex-col gap-8 px-4 py-6" aria-busy="true" aria-label="Loading experience">
      <div className="h-4 w-64 rounded bg-[var(--limestone)]" />
      <div className="h-10 w-3/4 rounded bg-[var(--limestone)]" />
      <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
        <div className="h-[420px] rounded-[var(--radius-lg)] bg-[var(--limestone)]" />
        <div className="hidden grid-cols-2 gap-2 md:grid">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[206px] rounded bg-[var(--limestone)]" />)}
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-4 rounded bg-[var(--limestone)]" style={{ width: `${100 - i * 6}%` }} />
          ))}
        </div>
        <div className="h-[520px] rounded-[var(--radius-lg)] bg-[var(--limestone)]" />
      </div>
    </div>
  );
}

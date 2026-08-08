/**
 * Structured data injection.
 *
 * Rendered as a plain script tag in the server-rendered HTML, so crawlers and
 * language models see it in the initial payload rather than after hydration.
 * The JSON is escaped: `<` inside a string value would otherwise let a
 * supplier's tour description close the script tag and inject markup.
 */
export function JsonLd({ data, id }: { data: unknown; id: string }) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return (
    <script
      type="application/ld+json"
      id={`ld-${id}`}
      // Content is serialised JSON we produced, never raw user input.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

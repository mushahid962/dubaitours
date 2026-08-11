# SEO playbook

## The canonical URL, decided once

```
/{country}/{city}/{category}/{subcategory?}/{slug?}
```

`/uae/dubai/tours/dune-buggy/can-am-maverick-1-hour`

**The short form `/dubai/hotels` 301s into it.** Both were requested. Serving
both without a redirect splits every ranking signal between two URLs for one
page — the most common self-inflicted SEO wound there is. The country prefix
wins because it scales to six countries without slug collisions (Al Khor
exists in Qatar *and* Saudi Arabia) and reads as a hierarchy to crawlers and
to people.

The redirect happens at the edge in `proxy.ts`. City slugs are globally unique
per locale, enforced by an index, so the lookup is unambiguous.

| Path | Purpose |
|---|---|
| `/{country}` | Country hub |
| `/{country}/{city}` | City hub, every category |
| `/{country}/{city}/{category}` | Hotels in Dubai |
| `/{country}/{city}/{category}/{sub}` | Dune buggy in Dubai |
| `/{country}/{city}/{category}/{sub}/{slug}` | One listing |
| `/destinations/{slug}` | Location *guide* — editorial, not inventory |
| `/{city}/{category}` | 301 → canonical |

`/destinations` is the browse tree and the editorial layer. The country/city
paths are the commercial layer. They are different pages with different jobs,
and neither canonicalises to the other.

## Categories

Two levels, and the second is where the money is. Nobody searches "tours in
Dubai" with a wallet open; plenty search "dune buggy Dubai". Fifteen top-level
categories, twenty subcategories seeded.

Top-level slugs are globally unique (enforced by trigger, since `/{city}/{slug}`
has no parent segment to disambiguate them). Child slugs are unique per parent,
so `/dubai/tours/yacht-tours` and `/dubai/cruises/yacht-charter` can coexist.

## What gets indexed

Only the **unfiltered first page** of any category. Filter combinations are
`noindex, follow` — combinatorially there are thousands, and indexing them
buries the pages with real demand.

Location pages carry their own gate (three listings, or 250+ characters of
original intro, or a hub with published children). See `VERIFICATION.md`.

## Internal linking

Every category page carries the full category rail for its city, so all ~35
category and subcategory pages in a city link to each other. That is what gets
a long tail discovered without a single manual link.

Subcategory chips sit above the results on parent pages — the fastest route
from a broad category to the specific search that converts.

## Structured data

`BreadcrumbList` and `FAQPage` on every category page, `ItemList` for the
results. FAQs are generated from real numbers — price floor and live count —
so they are never stale or invented.

## 1. The position we're competing for

Klook, GetYourGuide and Viator already own the head terms. Beating them on
"things to do in Dubai" head-on is a five-year, eight-figure project. The
opening is elsewhere, and it's specific:

- **Arabic.** The incumbents publish thin machine translations. Arabic search
  volume across the GCC is large, the competition is weak, and a genuinely
  native Arabic page with its own slug, its own reviews and its own FAQ can
  rank in months rather than years.
- **South Asian expat languages.** Hindi and Urdu queries from Dubai, Doha and
  Riyadh residents are almost entirely unserved.
- **Operator-level long tail.** "Desert safari with hotel pickup from Deira",
  "AlUla stargazing camp for families" — thousands of queries with real intent
  and no page built for them.
- **Answer engines.** AI Overviews and chat assistants now sit between the
  query and the click. Being the source they cite is a different discipline
  from being the tenth blue link, and almost nobody in this vertical is doing
  it deliberately.

## 2. URL architecture

```
/                                              home
/uae                                           country hub
/uae/dubai                                     city hub
/uae/dubai/things-to-do                        primary money page
/uae/dubai/desert-safari                       city × category
/uae/dubai/desert-safari/with-hotel-pickup     indexed modifier
/uae/dubai/attractions/burj-khalifa            attraction
/uae/dubai/areas/jumeirah                      neighbourhood
/tour/dubai-evening-desert-safari-bbq          the bookable page
/operator/gulf-dunes                           supplier profile (EEAT)
/travel-guide/best-time-to-visit-dubai         editorial
/ar/الامارات/دبي/رحلات-السفاري                 Arabic, native slugs
```

Rules enforced in code (`src/lib/seo/routes.ts`):

- English is unprefixed and canonical. `/en/dubai` 308-redirects to `/dubai`,
  so a single URL accumulates all the signal.
- Slugs come from the database, never from IDs, and are unique per locale.
- Only modifiers on the `INDEXABLE_MODIFIERS` allowlist get a clean path.
  Everything else is a query parameter and carries `noindex,follow`.

That last rule is the one that decides whether programmatic SEO works or
poisons the site. Sort orders, page numbers, price sliders and multi-select
facets generate combinatorial URLs; indexing them buries the pages that matter
under crawl budget spent on duplicates.

## 3. Programmatic generation — with a quality gate

The combinatorial surface is roughly:

```
6 countries × ~12 cities × ~40 categories × ~10 modifiers × 4 locales
≈ 115,000 candidate URLs
```

Publishing 115,000 near-identical pages is how a domain gets classified as
thin content. Every generated page must pass a gate before it enters the
sitemap:

| Gate | Threshold | Why |
|---|---|---|
| Inventory | ≥ 3 bookable tours | Below that the page can't answer the query |
| Unique copy | ≥ 250 words not shared with any sibling | Templated intros are the tell |
| Real data | Live price range, live rating, live availability | The differentiator vs. scraped competitors |
| Demand | Non-zero impressions after 90 days | Otherwise it's pruned |
| Internal links | ≥ 3 inbound from other pages | Orphans don't get crawled |

Pages that fail stay live, render fine for a user who lands on them, and carry
`noindex,follow` until they qualify. Launch expectation: ~4,000 indexable
pages, growing with inventory — not 115,000 on day one.

Unique copy comes from data the competitors don't have: the actual price
spread across operators in that city, the actual median duration, what the
last 30 reviews complained about, which months are booked out. That's
generated from the database per page and refreshed monthly, not written once
by a model and left to rot.

## 4. Structured data

Emitted through `src/lib/seo/json-ld.ts`, one `@graph` per page.

| Page | Nodes |
|---|---|
| Every page | `Organization`, `WebSite`, `BreadcrumbList` |
| Tour | `TouristTrip` + `Offer` + `AggregateRating` + `Review` + `FAQPage` + `VideoObject` |
| City / category | `ItemList` + `FAQPage` + `Place` |
| Blog post | `Article` with `author` and `reviewedBy` |
| Operator | `Organization` + `AggregateRating` |

`AggregateRating` is emitted only when `rating_count > 0`. Synthetic ratings
are the fastest route to a structured-data manual action, and the recovery
takes months.

## 5. Answer-engine optimisation

Answer engines don't rank pages; they extract claims and attribute them. What
gets cited is a self-contained sentence with a number and a date in it.
`src/lib/seo/answer-engine.ts` generates that layer from live data:

- **Answer summary** — one paragraph near the top of every tour page stating
  price, duration, confirmation speed, cancellation window and rating as
  plain fact. Written to be quoted verbatim.
- **Generated questions** — the four questions travellers actually ask, each
  answered in one lift-able sentence, rendered on-page *and* as `FAQPage`.
- **`/llms.txt`** — a machine-readable index of what the site covers and which
  URLs are authoritative.
- **`robots.txt`** — explicit `allow` for `GPTBot`, `ClaudeBot`,
  `PerplexityBot` and `Google-Extended`.

The strategic bet: a model that can read a live price and a live cancellation
policy from us will cite us over a competitor whose page says "from $49*"
with an asterisk. Freshness and specificity are the ranking factors here.

## 6. E-E-A-T

Experience and authority are the hardest things for a new marketplace to fake
and the most valuable to actually have.

- **Author entities.** Every guide is bylined to an `authors` row with a real
  bio, credentials and declared destination expertise, surfaced at
  `/authors/[slug]` and wired into `Article.author`.
- **Reviewed-by.** Destination experts review guides; the reviewer appears
  on-page and in `Article.reviewedBy`.
- **Verified reviews only.** RLS enforces that a review requires a completed
  booking on a departure that has already happened. That constraint is a
  product decision as much as a security one — it is the honest claim behind
  the "verified" badge.
- **Operator transparency.** Licence number, years operating, response time
  and cancellation record on every supplier profile.

## 7. Performance as a ranking factor

| Metric | Target | How |
|---|---|---|
| LCP | < 1.8 s | Static HTML, hero as AVIF with `priority`, self-hosted fonts |
| INP | < 200 ms | Server Components by default; the booking panel is the main client island |
| CLS | < 0.05 | Explicit width/height on every image, reserved ad slots |
| TTFB | < 200 ms | ISR from the CDN edge; database is off the hot path |

Ad slots reserve their space in CSS before the ad loads. An unreserved slot is
the single most common cause of CLS on a monetised travel site.

## 8. Measurement

- Search Console API → nightly pull of impressions and position **per URL
  template**, so we know whether `city × category` as a pattern is working,
  not just whether one page ranks.
- Indexation ratio per template. If a template sits below 60% indexed, the
  quality gate is too loose and generation pauses.
- Citation tracking: sampled AI Overview and assistant answers for the top 200
  queries, checking whether we're the cited source.
- Revenue attribution per template, so SEO investment follows bookings.

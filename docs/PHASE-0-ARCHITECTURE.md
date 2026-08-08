# Phase 0 — Architecture

Approved decisions: listing/product spine (Option A), regions layer,
single-namespace URL constraint, resequenced phases, existing tested work
migrated rather than rebuilt.

---

## 1. The three-layer spine

```
BUSINESS   companies          the legal entity — operator, hotel group, mall
    │                         owns, is claimed, is verified, gets paid
    ▼
LISTING    listings           the page a traveller lands on
    │                         always has: location, media, reviews, SEO, filters
    ▼
PRODUCT    tour_options       the sellable unit
           + tour_prices      only exists where fulfilment = 'booking'
           + tour_departures
```

A listing carries a **vertical** (tours, things-to-do, attractions, hotels,
malls, restaurants) and a **fulfilment** mode:

| Fulfilment | Meaning | Example |
|---|---|---|
| `booking` | Real inventory, we take payment | Desert safari |
| `enquiry` | No inventory, captures a lead with requirements | Hotel, group quote |
| `affiliate` | Hands off to a partner | Flights, insurance |
| `info_only` | Reference content | Mall, public beach |

The vertical sets the default; a listing may override it. A hotel that later
signs up for real-time booking becomes `booking` without changing vertical.

**This single distinction is what lets one codebase serve Klook, TripAdvisor
and Visit Dubai at once.** Everything else follows from it.

### Why `tours` was not merged away

26 foreign keys point at `tours`, `tour_options` and `tour_departures`, and
the booking engine above them is attack-tested — seat locking, idempotent
webhooks, RLS isolation. So the refactor is **additive**: `listings` is the
parent page entity and `tours` is its 1:1 booking extension.

```
listings.tour_id → tours.id     (a bookable listing)
listings.poi_id  → points_of_interest.id   (a venue listing)
constraint: at most one of the two may be set
```

Triggers keep the listing row in step whenever a tour or venue is edited.
Doing that sync in application code guarantees drift the first time someone
runs a script.

---

## 2. Geography

```
countries → regions → cities → areas → listings
```

`regions` was the missing level. Dubai is both an emirate and a city; Abu
Dhabi emirate contains Al Ain. Without it there is no way to express
"everything in Sharjah emirate" and no URL for it — and retrofitting a
hierarchy level after URLs are indexed means rewriting every one.

Seeded: seven UAE emirates, one region per other country until their own
subdivisions are added. Verified: **0 cities without a region.**

---

## 3. URL architecture

```
/{country}/{city}                        city hub
/{country}/{city}/{vertical}             hotels in Dubai
/{country}/{city}/{vertical}/{slug}      Burj Al Arab   ← listing
/{country}/{city}/{vertical}/{category}  dune buggy     ← category
/{country}/{region}                      Sharjah emirate
/business/{slug}                         operator profile
/guide/{slug}                            editorial
```

English unprefixed and canonical; `ar`, `hi`, `ur` prefixed. Arabic slugs are
native script.

### The collision, and how it is made impossible

The last segment is either a category or a listing. Rather than hoping they
never collide, a trigger on `listing_translations` **refuses any slug already
used by a category in the same locale**, and a unique index enforces one slug
per locale overall.

Slugs are namespaced per locale, so `/hi/…/desert-safari` and
`/en/…/desert-safari` are different URLs and do not conflict — only a clash
within one language is a real collision.

Verified in `supabase/tests/06_listing_spine.sql`.

---

## 4. Roles

| Role | Gains it by | Boundary |
|---|---|---|
| `traveler` | Signing up | Own bookings and reviews only |
| `company_owner` | Application or claim, admin-approved | Own business only |
| `company_staff` | Invited by owner | Own business, permission-scoped |
| `editor` / `support` | Assigned | Content and moderation, no payouts |
| `admin` / `super_admin` | Assigned by hand in the database | Everything, audited |

Enforced by RLS in Postgres, not the router. The two privileged transitions —
traveller → owner, and listing → published — are `security definer` functions
that re-check the caller. Both are attack-tested; see `ACCESS-CONTROL.md`.

---

## 5. SEO architecture

Moved from phase 19 to phase 0–2, because building 18 phases of pages and
then discovering the URLs are wrong resets every ranking.

- `listing_index` — one flat relation per (listing, locale), no joins at read
  time, serving every vertical.
- Programmatic pages from `region × city × vertical × category`, **gated**:
  three listings minimum, 250 words of data-derived copy, real prices.
  Combinatorial space is ~115,000 URLs; publishing all of them is how a
  domain gets classified as thin.
- JSON-LD per vertical: `TouristTrip`, `Hotel`, `TouristAttraction`,
  `ShoppingCenter`, `LocalBusiness`.
- hreflang only for locales that actually have a translation.
- Slug changes auto-write 301s.
- Arabic as the strategic wedge — the incumbents publish thin machine
  translations, and that is the opening.

---

## 6. Folder structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (marketing)/            home, partner, about
│   │   ├── [country]/
│   │   │   ├── [region]/           emirate/province hub
│   │   │   └── [city]/
│   │   │       ├── [vertical]/     hotels, tours, malls
│   │   │       │   └── [slug]/     listing OR category — resolved server-side
│   │   │       └── things-to-do/
│   │   ├── business/[slug]/        operator profile
│   │   ├── guide/[slug]/           editorial
│   │   ├── (booking)/              checkout, confirmation
│   │   ├── (auth)/
│   │   ├── account/                traveller
│   │   ├── dashboard/[company]/    business portal
│   │   └── admin/                  CRM
│   ├── api/                        webhooks, cron, feeds
│   └── sitemaps/[kind]/
├── features/                       vertical slices: search, booking, reviews, ads
├── components/{ui,listings,directory,dashboard,admin,seo}
├── actions/                        'use server' — one file per mutation
├── services/                       business logic, no React
├── schemas/                        zod — the only trusted boundary
├── lib/{supabase,seo,cache,i18n,payments,auth}
└── types/

supabase/
├── migrations/                     forward-only, numbered
├── seed/                           data — never in migrations
└── tests/                          psql suites run as real roles
```

**Migrations define schema; the seed defines data.** Learned the hard way this
phase: a backfill inside a migration ran before the seed and silently produced
zero rows.

---

## 7. Scaling to millions

| Pressure | Approach |
|---|---|
| Catalog reads | `listing_index`, flat, security_invoker, no read-time joins |
| Filters | GIN on `amenities` (text[]) and `attributes` (jsonb) |
| Facet counts | `directory_facets()` in the database, returns counts not rows |
| Impressions | Partitioned by month |
| Inventory | Row locks on departure rows — the only correct place |
| Pages | ISR + tag revalidation; database off the hot path |
| Sitemaps | Chunked at 20k URLs, cached |
| Scheduled work | pg_cron inside Postgres, not the web tier |

---

## 8. Implementation order (resequenced)

| # | Phase | State |
|---|---|---|
| 0 | Architecture, listing spine, regions, URL namespace | **Done this phase** |
| 1 | Auth and roles | Done, attack-tested |
| 2 | Locations + URL architecture | Schema done; region pages to build |
| 3 | Categories | Done |
| 4 | Businesses | Done — applications, approval, claims |
| 5 | Services / verticals | Schema done; per-vertical pages to build |
| 6 | Tours | Done |
| 7 | **Search + filters** *(moved up from 12)* | Done for tours and directory |
| 8 | Packages / pricing | Done |
| 9 | Availability | Done, bulk generation |
| 10 | Booking | Done, seat-locked |
| 11 | Payments | Done, signature-verified webhook |
| 12 | Reviews | Done, verified-booking gated |
| 13 | **Verticals: hotels, attractions, things-to-do, malls** *(merged 13–16)* | Spine done; detail pages to build |
| 14 | Admin CRM | Done |
| 15 | Business portal | Done |
| 16 | **Email + notifications** *(moved up from 24)* | **Not started — highest risk** |
| 17 | SEO optimisation, AEO, internal linking | Engine done; optimisation pending |
| 18 | Content: guides, editorial | Editor done; content pending |
| 19 | Promotions, featured, ads | Schema done, UI pending |
| 20 | Favourites, saved searches | Schema done, UI pending |
| 21 | Reputation, moderation | Partial |
| 22 | Analytics | Not started |
| 23 | Gulf expansion | Schema ready for all six countries |

### The one thing that should not wait

**Email.** A traveller pays, sees "confirmation is on its way", and nothing
arrives. That is not an incomplete feature — it is a broken promise on a live
page, and it should be the next phase built.

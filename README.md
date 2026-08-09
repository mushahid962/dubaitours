# TravelHub Gulf

A tours, tickets and experiences marketplace for the GCC — UAE, Saudi Arabia,
Qatar, Oman, Bahrain and Kuwait — built to be found in four languages and to
take money without ever overselling a seat.

## What's in this repository

This is the architectural foundation: the schema, the transactional core, the
SEO engine and the design system. It is not the finished product, and the
sections below say plainly which parts are complete and which are scaffolded.

| Area | State |
|---|---|
| Postgres schema — 60+ tables, enums, constraints | Complete, runnable |
| Row Level Security across every table | Complete |
| Pricing, seat holds, booking confirmation, refunds | Complete |
| Search index, trigram autocomplete, geo "nearby" | Complete |
| SEO: routing, metadata, JSON-LD, hreflang, sitemaps, AEO | Complete |
| Design tokens, tour card, booking widget | Complete |
| Seed data — 6 countries, 10 cities, category tree, live tour | Complete, idempotent |
| **Tour detail page end-to-end** — layout, data layer, gallery, reviews, FAQ, ISR + tag revalidation | Complete |
| **Three-actor access control** — applications, approval, suspension, audit trail | Complete, attack-tested |
| Auth: email OTP, Google, Apple, OAuth callback | Complete |
| Admin application review queue | Complete |
| Homepage, app shell, Tailwind + build config | Complete — `npm run dev` works with zero setup |
| City, category, search, checkout pages | Not started — see roadmap |
| Supplier dashboard, admin panel, CMS, ad server UI | Not started — see roadmap |

Everything marked complete was applied to a real PostgreSQL 16 + PostGIS
cluster and exercised with the test scripts in `supabase/tests/` — including
oversell attempts, replayed webhooks and two privilege-escalation attacks.
Results are in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

## Continuing this project in Claude Code

`CLAUDE.md` in the root is loaded automatically by Claude Code at the start of
every session — architecture, conventions, verification workflow and the
mistakes already paid for. Setup steps in
[`docs/MOVING-TO-CLAUDE-CODE.md`](docs/MOVING-TO-CLAUDE-CODE.md).

## Architecture

The system is built on a three-layer spine — **business → listing → product**
— which is what lets one codebase serve a booking marketplace, a directory and
a destination guide at once. Read
[`docs/PHASE-0-ARCHITECTURE.md`](docs/PHASE-0-ARCHITECTURE.md) first; it
covers the entity model, URL architecture, roles, SEO and the phase order.

## Loose files at your root, or trouble pushing to GitHub?

See [`docs/FIXING-YOUR-FOLDER.md`](docs/FIXING-YOUR-FOLDER.md). It lists
exactly which 15 items belong at the root, and includes `cleanup.ps1` to
remove strays. **Always extract the ZIP** — downloading individual files
drops copies at the root where they do nothing, and a stray root
`middleware.ts` will break your routing.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. It runs with **no configuration at all** — you
get the homepage with demo content and a banner telling you the database isn't
connected yet.

**New to this?** Follow [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md),
which walks from this repository to a live Vercel URL step by step, including
what you should see at the end of each step.

Experienced? [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) has the terse version.

## The four decisions that shape everything else

**Inventory is a locked row, not an application check.** `tour_departures`
carries a capacity counter and a check constraint; `hold_seats()` takes
`FOR UPDATE` before it decrements. Two people racing for the last seat is
resolved by Postgres, which is the only place it can be resolved correctly.

**The browser never states a price.** It states a choice — option, date, party
size. `priceCart()` reads current prices server-side, re-applies seasonal
rules, and returns the total. A tampered request gets the correct price back.

**Translations are rows.** `tour_translations(tour_id, locale, …)` gives
Arabic its own slug, its own meta description and its own unique index. A
JSONB column can't enforce "one slug per locale", and that constraint is what
makes the Arabic SEO strategy work at all.

**Programmatic pages must earn indexation.** The combinatorial URL space is
~115,000 pages; publishing all of them is how a domain gets classified as thin
content. Pages ship with `noindex,follow` until they clear a gate — three
bookable tours, 250 words of unique copy, real price and rating data, and
inbound internal links. See [`docs/SEO-PLAYBOOK.md`](docs/SEO-PLAYBOOK.md).

## The tour page, end to end

`src/app/[locale]/tour/[slug]/page.tsx` is the reference implementation every
other page should follow. It shows how the pieces fit:

- `generateStaticParams` pre-renders the top 2,000 tours by popularity and
  lets the long tail render on first request — a 40-minute build to serve
  pages that get a handful of visits a month is a bad trade.
- `generateMetadata` and the page body both call `getTourBySlug`, which is
  wrapped in React `cache`, so that's one query, not two.
- hreflang alternates are built from the locales a tour is *actually*
  translated into. Pointing hreflang at a URL that 404s is worse than omitting
  the tag.
- The page is ISR-cached for an hour; availability is fetched live inside it
  and deliberately not cached. A stale price is an annoyance, a stale seat
  count is a refund.
- `publishTourAction` clears Redis *before* the Next data cache. Reversed,
  Next could repopulate from a stale Redis entry in the gap.

## Layout

```
src/
  app/          routes, route handlers, sitemaps, robots
  features/     vertical slices (search, booking, reviews, ads, dashboard)
  components/   ui primitives and shared domain components
  actions/      'use server' mutations — one file per mutation
  services/     business logic, no React
  schemas/      zod — the only trusted boundary
  lib/          supabase, seo, cache, i18n, payments, ai
supabase/
  migrations/   forward-only, numbered
  seed/
docs/
```

Full tree and the reasoning behind it in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system shape, ER diagram, API surface, auth flow, caching
- [SEO playbook](docs/SEO-PLAYBOOK.md) — URL design, programmatic strategy, structured data, AEO, E-E-A-T
- [Access control](docs/ACCESS-CONTROL.md) — the three actors, and how the traveler → operator transition is closed
- [Security](docs/SECURITY.md) — threat model and controls
- [Deployment](docs/DEPLOYMENT.md) — environments, migrations, cron, release checklist
- [Getting started](docs/GETTING-STARTED.md) — local → GitHub → Vercel → Supabase, for a first-time deployer
- [Verification](docs/VERIFICATION.md) — what was actually run against Postgres, and the results
- [Roadmap](docs/ROADMAP.md) — phases, ship gates, and what's deliberately deferred

## Scripts

```bash
pnpm dev              # local development
pnpm build            # production build
pnpm db:types         # regenerate types from the live schema
pnpm db:reset         # reset local database and reseed
pnpm test             # unit tests (vitest)
pnpm test:e2e         # Playwright — checkout, RLS isolation, SEO tags
pnpm lint             # eslint + typecheck
```

## Renaming the project

The brand appears in `src/lib/seo/json-ld.ts`, `src/lib/seo/metadata.ts`, the
`site_settings` seed row, and `.env.example`. Change those five places and the
name is gone from the codebase.

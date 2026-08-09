# TravelHub Gulf — working notes

Read this first. It is the context a new engineer would need on day one, plus
the mistakes already made so they are not repeated.

## What this is

A multi-vertical travel platform for the GCC — part booking marketplace
(Klook), part directory (TripAdvisor), part destination guide (Visit Dubai).
Six countries: UAE, Saudi Arabia, Qatar, Oman, Bahrain, Kuwait.

Next.js 16 (App Router, Turbopack) · TypeScript · Supabase/Postgres ·
Tailwind v4 · Stripe.

## Read before changing anything structural

- `docs/PHASE-0-ARCHITECTURE.md` — the spine, URLs, roles, phase order
- `docs/ACCESS-CONTROL.md` — who can do what, and how it is enforced
- `docs/VERIFICATION.md` — what has actually been tested, and what has not
- `docs/SEO-PLAYBOOK.md` — URL design and the programmatic strategy

## The architecture in one paragraph

Three layers: **business → listing → product**. `companies` is the legal
entity. `listings` is the page a traveller lands on and is the parent of
everything — it carries location, media, reviews, filters and SEO. Products
(`tour_options` → `tour_prices` → `tour_departures`) exist only where a
listing actually sells something. Each listing has a *vertical* (tours,
hotels, attractions, malls…) and a *fulfilment* mode (`booking`, `enquiry`,
`affiliate`, `info_only`). That one distinction is what lets a single codebase
serve a marketplace, a directory and a guide.

`listings.tour_id` and `listings.poi_id` link to the detail tables; at most
one may be set. Triggers keep them in sync — never sync in application code.

## Non-negotiables

**RLS is the security boundary.** Helpers in `src/lib/auth/session.ts` decide
what to *render*. The database decides what is *allowed*. If you delete every
helper, nothing leaks. Treat a missing UI guard as a UX bug and a missing
policy as an incident.

**The browser never states a price.** It states a choice — option, date, party
size. `priceCart()` re-prices server-side. A tampered request gets the correct
price back.

**Inventory is a locked row.** `hold_seats()` takes `FOR UPDATE` on the
departure. Never check availability in application code.

**Only staff publish.** Suppliers submit; a trigger blocks any non-staff
transition to `published`.

**Admins cannot create admins.** Only `super_admin` may call `assign_role`,
and the last active super admin cannot be demoted.

## Conventions

- **Migrations define schema. The seed defines data.** A backfill inside a
  migration runs *before* the seed and silently produces zero rows.
- Migrations are forward-only and numbered. Fix mistakes with a new one.
- Zod at every trust boundary; nothing reaches a query unparsed.
- Server Components by default. Client components only where there is state.
- Filters and pagination are links, not JavaScript — shareable, crawlable,
  back-button-safe.
- Money is `numeric(12,2)` with a stated currency. KWD, BHD and OMR use
  **three** decimals — `toStripeAmount()` handles it.
- Slugs are per locale, native script. Changing one auto-writes a 301.

## Gotchas already paid for

| Trap | What happens |
|---|---|
| Views over RLS tables | Run as the view's OWNER by default → cross-tenant leak. Always `with (security_invoker = true)`. |
| Trigger functions | Run as the CALLER. If they touch the `internal` schema or write aggregates, they need `security definer`. |
| `text[] \|\| 'literal'` | Parsed as an array literal. Cast: `\|\| 'x'::text`. |
| `CASE` returning two bare literals | Resolves to `text`, not the enum. Cast each branch. |
| `UPDATE ... FROM` | Cannot join back to the target's own alias. Use a correlated subquery. |
| `ALTER TYPE ... ADD VALUE` | Cannot be used in the same transaction that added it. Split the migration. |
| Enum renames | `RENAME VALUE` rewrites rows, but **not** literals inside plpgsql bodies. Recreate those functions. |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY` | Cannot run inside a function body. |
| Vercel Hobby cron | One run per day. Scheduled work lives in `pg_cron` (migration 0013). |
| Turbopack root | A stray lockfile in a parent folder hijacks it. Pinned in `next.config.ts`. |
| Build-time DB access | `generateStaticParams` must catch errors, or an unmigrated database fails the deploy. |
| DB error vs. not found | An outage must return 500, not 404. Google deindexes on 404. |

## Verifying work — do this, do not skip it

Every phase so far was verified against a real Postgres, not asserted. Several
serious bugs were only found this way, including a cross-tenant data leak.

```bash
# Schema: apply every migration, then the seed TWICE (it must be idempotent)
createdb thg
psql -d thg -c 'create extension if not exists pgcrypto'
psql -d thg -f supabase/tests/00_local_auth_shim.sql   # local only; Supabase provides this
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d thg -f "$f"; done
psql -v ON_ERROR_STOP=1 -d thg -f supabase/seed/seed.sql
psql -v ON_ERROR_STOP=1 -d thg -f supabase/seed/seed.sql

# Security: run as real roles, and try the attacks
psql -d thg -f supabase/tests/02_rls_isolation.sql
psql -d thg -f supabase/tests/03_actor_boundaries.sql
psql -d thg -f supabase/tests/07_auth_rbac.sql      # fresh DB only, not idempotent

# App
npm run build          # must pass with zero type errors
npx next start -p 3000 # then curl the routes you changed
```

Write a new `supabase/tests/NN_*.sql` for any phase that adds a privilege
boundary, and make it attempt the escalation, not just the happy path.

## Where things are

```
src/app/[locale]/       routes; `en` is unprefixed, rewritten by proxy.ts
src/actions/            'use server' mutations, one file each
src/services/           business logic, no React
src/schemas/            zod — the only trusted boundary
src/lib/{auth,seo,cache,payments,supabase,i18n}
supabase/migrations/    forward-only
supabase/seed/          data
supabase/tests/         psql suites, run as real roles
```

## Status

Done and tested: auth + 10-role RBAC, geography with regions, categories,
businesses with approval and claims, tours, pricing, availability, booking
with seat locking, Stripe payments, reviews, search and filters, directory
verticals, admin CMS, business portal, SEO engine, listing spine.

**Not built — and the first one matters most:**

1. **Email delivery.** A traveller pays, the page says "confirmation is on its
   way", and nothing arrives. That is a broken promise on a live page, not an
   unfinished feature. Build this next.
2. Media library with a picker (featured image is a pasted ID today).
3. Consent banner — marketing pixels are unlawful without it, which is why
   Header Scripts is read-only.
4. Analytics, custom pages, locations/services admin, import, review
   moderation UI.

## House style

Say what is not done. The docs in `docs/` distinguish "verified" from
"written but untested" on purpose — keep that habit. A README that overstates
what works costs more than one that admits a gap.

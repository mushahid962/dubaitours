# Verification

Every SQL file in this repository was applied to a real PostgreSQL 16 cluster
with PostGIS before being committed, and the transactional core was exercised
against seeded data. This document records what was actually run, so the
claims in the README are checkable rather than aspirational.

## How to reproduce

Supabase supplies `auth.users`, `auth.uid()` and the `anon` / `authenticated`
roles. On a bare cluster those don't exist, so `00_local_auth_shim.sql` stands
in for them. Against a real Supabase project, skip it.

```bash
createdb thg
psql -d thg -c 'create extension if not exists pgcrypto'
psql -d thg -f supabase/tests/00_local_auth_shim.sql     # local only
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d thg -f "$f"; done
psql -v ON_ERROR_STOP=1 -d thg -f supabase/seed/seed.sql
psql -d thg -f supabase/tests/01_booking_core.sql
psql -d thg -f supabase/tests/02_rls_isolation.sql
```

## Results

**Migrations** — all seven applied clean, in order, with `ON_ERROR_STOP`.

**Seed** — ran three times consecutively with identical final counts, proving
idempotency: 6 countries, 10 cities, 9 categories, 1 published tour, 2 options,
4 price rows, 120 departures, 3 FAQs, 1 search-index row.

**Booking core** (`01_booking_core.sql`):

| Behaviour | Result |
|---|---|
| `resolve_price` returns base price | AED 149 list / 122 net |
| Seasonal rule applies on matching weekdays only | Fri–Sat AED 119.20, Sun–Thu AED 149 |
| `hold_seats` succeeds within capacity | 4 of 6 held |
| Second hold beyond capacity is refused | returns `false`, counters unchanged |
| `confirm_booking` converts holds to bookings | held 4 → booked 4, held 0 |
| Replayed confirmation is idempotent | second call returns the same confirmed row, no double-issue |
| Ticket codes issued once | `ticket_code` present, not regenerated |
| `expire_stale_holds` reclaims abandoned carts | booking → `expired`, seats released |
| Capacity check constraint fires on direct UPDATE | `check_violation` raised — oversell impossible even bypassing the functions |
| Full-text relevance | seeded tour matches "desert safari dubai" |
| `nearby_tours` geo search | returns the tour 36 km from Dubai centre |
| Rating trigger | review publish → `rating_avg` 5.00, `rating_count` 1 |
| `refresh_popularity_scores` | computes a score without error |
| `on_auth_user_created` trigger | profile auto-created; explicit insert was a no-op |

**RLS isolation** (`02_rls_isolation.sql`), run as each role via
`set role` plus a JWT subject claim:

| Actor | Bookings visible | Outcome |
|---|---|---|
| Alice (booked) | 1 | sees only her own |
| Mallory (unrelated traveller) | 0 | sees nothing |
| Supplier staff | 2 | sees only their company's |
| Anonymous | 0 | catalog readable, bookings and profiles return 0 rows |

Two attacks were attempted and both were blocked by policy, not by
application code:

- Mallory updating her own `profiles.role` to `super_admin` → rejected by the
  `with check (role = auth_role())` clause.
- Mallory inserting a five-star review for a tour she never booked → rejected
  by the insert policy that requires a completed booking on a departure that
  has already happened.

**Actor boundaries** (`03_actor_boundaries.sql`) — the full operator
lifecycle, run as three different roles:

| Step | Result |
|---|---|
| Traveller creates a partner application | draft, not yet submitted |
| Traveller sets `status = 'approved'` directly | refused by RLS |
| Traveller sets own `profiles.role` | refused by RLS |
| Traveller calls `approve_company_application` | `insufficient_privilege` |
| Traveller submits via the function | submitted, timestamped |
| Unrelated traveller queries the queue | 0 rows |
| Admin approves | company created, slug `desert-co`, commission 15% |
| Admin approves again | idempotent, same company returned |
| Applicant's role after approval | `company_owner` with owner permissions |
| Owner creates a tour under their company | succeeds |
| Owner creates a tour under a competitor's company | refused by RLS |
| Owner queries a competitor's bookings | 0 rows |
| Admin suspends the company | status suspended **and** published tours paused in the same transaction |
| Audit trail | 2 admin actions logged with actor role; 3 application status events |

Three bugs were found and fixed by running this rather than assuming it:
`internal.reindex_from_tour`, `internal.set_booking_reference` and
`internal.recalc_tour_rating` were running with the caller's privileges and
would have failed on the first real supplier or traveller write.

## Fixes verified after user reports

Two problems were reported from a Windows machine and both were reproduced
here before being fixed:

**`Couldn't find any 'pages' or 'app' directory`** — Turbopack infers the
project root from the nearest lockfile, walking *up* the tree. A stray
`package-lock.json` in the user's home directory made it treat `C:\Users\...`
as the root. Reproduced by placing a lockfile in a parent directory: the dev
server failed identically. `next.config.ts` now pins `turbopack.root`, and
with the same stray lockfile present the server starts clean and serves
`GET /` and `GET /search` at 200.

**`7 vulnerabilities (3 moderate, 2 high, 2 critical)`** — all from
devDependencies: `esbuild` via `vitest@2`, and `tar` via the `supabase` CLI.
`npm audit --omit=dev` already reported 0, so nothing shipped was affected.
Upgraded to `vitest@4.1.10` and `supabase@2.111.0`; `npm audit` now reports 0
vulnerabilities with dev dependencies included.

`src/middleware.ts` was also renamed to `src/proxy.ts` (exporting `proxy`
rather than `middleware`), which is the Next 16 convention and removes the
deprecation warning printed on every build.

## Phase 0 — listing spine and regions

Migrations 0016 (regions) and 0017 (listing spine) applied to a clean
database, seed run twice, all 17 migrations clean.

`06_listing_spine.sql`:

| Check | Result |
|---|---|
| Tours and venues in one `listing_index` | 8 listings across 4 verticals |
| Listing slug claiming a category slug (same locale) | Refused by trigger |
| Listing with both a tour and a venue attached | `check_violation` |
| Renaming a tour | Propagates to its listing |
| Changing a tour price | Propagates to its listing |
| Fulfilment per vertical | tours=booking, hotels=enquiry, malls=info_only |
| Per-listing fulfilment override | One hotel switched to booking |
| Listings without a region | 0 of 8 |
| Cities without a region | 0 of 15 |

Two mistakes found and fixed while building this:

1. **The region backfill lived in a migration and produced zero rows** —
   migrations run before the seed, so there were no countries to join to.
   Data moved to `seed.sql`; migrations now define schema only.
2. **`UPDATE ... FROM` cannot join back to the target table's own alias.**
   Rewritten as a correlated subquery.

The slug guard is deliberately per-locale: `/hi/…/desert-safari` and
`/en/…/desert-safari` are different URLs and do not collide. Only a clash
within one language is a real collision, and that is what the trigger blocks.

## Sign-up failure (fixed in 0023)

Every registration failed with "Database error creating new user", including
the first admin through `/setup`.

**Cause:** `profiles` carried `FORCE ROW LEVEL SECURITY`. Supabase's sign-up
pattern is a `SECURITY DEFINER` trigger whose owner bypasses RLS to provision
the profile row — FORCE removes exactly that, so the insert was refused and
the whole sign-up rolled back.

**Why every test missed it:** locally psql connects as `postgres`, which is a
SUPERUSER and bypasses RLS even under FORCE. On Supabase `postgres` is
deliberately neither superuser nor BYPASSRLS. Reproduced only after creating
`sb_owner` with `nosuperuser nobypassrls`, giving it ownership of the table
and function, and running as that role:

```
SIGN-UP FAILED: new row violates row-level security policy for table "profiles" [42501]
```

After 0023: `SIGN-UP WORKED`, profile created as `customer` / `active`.

Re-verified afterwards, unchanged: RLS isolation (`02`), and all eight
escalation guards in `07_auth_rbac.sql`.

Two process lessons, both now in CLAUDE.md:

- A superuser test proves nothing about RLS.
- An exception handler that replaces `sqlerrm` with a guess destroys the
  evidence. My handler asserted "migration 0023 adds the missing policy" while
  the real error said something else entirely, and it cost an hour.

## Not yet verified

The TypeScript layer has not been type-checked or run — it depends on
`src/types/database.generated.ts`, which is produced by `pnpm db:types`
against a live Supabase project. Run that before the first `pnpm build`.

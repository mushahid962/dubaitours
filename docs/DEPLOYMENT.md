# Deployment

## Prerequisites

Node 22+, pnpm 9+, Docker (for local Supabase), a Vercel project, a Supabase
project, an Upstash Redis database, and a Stripe account.

## Local setup

```bash
pnpm install
cp .env.example .env.local          # fill in the Supabase and Redis values

supabase start                      # local Postgres + Auth on :54321
supabase db reset                   # applies migrations, then seed/seed.sql
pnpm db:types                       # regenerate src/types/database.generated.ts

pnpm dev
```

`supabase db reset` is destructive by design — the seed is idempotent and the
local database is disposable. Never point it at a remote project.

## Migrations

```bash
supabase migration new add_gift_card_expiry     # creates a numbered file
supabase db diff -f add_gift_card_expiry        # or diff from local changes
supabase db push --db-url "$SUPABASE_DB_URL"    # apply to staging/production
```

Forward-only. A mistake is corrected by a new migration, never by editing one
that has already run. CI fails the build if generated types drift from the
migrations.

## Environments

| Environment | Branch | Database | Notes |
|---|---|---|---|
| Preview | any PR | Supabase branch | Seeded, Stripe test mode |
| Staging | `develop` | staging project | Full seed, test payments |
| Production | `main` | production project | Live keys, protected |

## Vercel configuration

Region `fra1` or `dxb1` when available — the database lives closest to GCC
traffic, and cross-region round-trips at checkout are the latency that shows.

```json
{
  "crons": [
    { "path": "/api/cron/expire-holds",  "schedule": "* * * * *" },
    { "path": "/api/cron/popularity",    "schedule": "0 2 * * *" },
    { "path": "/api/cron/sitemap-warm",  "schedule": "0 3 * * *" },
    { "path": "/api/cron/payouts",       "schedule": "0 4 * * 1" },
    { "path": "/api/cron/review-digest", "schedule": "0 9 * * *" }
  ]
}
```

Every cron route checks `Authorization: Bearer $CRON_SECRET` before doing
anything. An unauthenticated cron endpoint is a free denial-of-service.

Prefer `pg_cron` inside Supabase for `expire_stale_holds()` if you'd rather
the reaper not depend on the web tier being healthy:

```sql
select cron.schedule('expire-holds', '* * * * *', $$select expire_stale_holds()$$);
select cron.schedule('popularity', '0 2 * * *', $$select refresh_popularity_scores()$$);
```

## Webhooks

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # local
stripe trigger payment_intent.succeeded
```

In production, register the endpoint in the Stripe dashboard and store the
signing secret as `STRIPE_WEBHOOK_SECRET`. Verify the signature before parsing
the body — Next.js route handlers must read the raw body for this to work.

## Release checklist

- [ ] Migrations applied to staging and smoke-tested
- [ ] `pnpm build` clean, no type errors
- [ ] Playwright suite green: checkout, RLS isolation, canonical tags
- [ ] Lighthouse ≥ 95 on home, city and tour pages
- [ ] `robots.txt` and all sitemap chunks return 200
- [ ] Stripe webhook receiving events in live mode
- [ ] Sentry release created and source maps uploaded
- [ ] Rollback plan: previous deployment pinned in Vercel

## Monitoring

- Sentry for exceptions, with the booking flow tagged as a critical
  transaction.
- Vercel Analytics for real-user Core Web Vitals.
- Supabase dashboard for slow queries; `pg_stat_statements` is enabled in
  migration 0001.
- Alerts that page someone: checkout error rate > 2%, webhook failures,
  seat-hold reaper not running for 5 minutes, p95 TTFB > 800 ms.

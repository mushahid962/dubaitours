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

Region `fra1` — closest to GCC traffic of Vercel's European regions. Checkout
latency is where a cross-region round trip shows.

`vercel.json` deliberately contains **no cron jobs**. Vercel's Hobby plan
allows one cron run per day, and the seat-hold reaper must run every minute:
a hold expires after 15 minutes, so a daily sweep would leave seats
unsellable for up to 24 hours.

## Scheduled jobs (pg_cron)

Recurring work runs inside Postgres instead. Migration `0013` registers four
jobs, but **pg_cron must be enabled once per project first**:

> Supabase Dashboard → Database → Extensions → search "pg_cron" → enable

Then run `supabase/migrations/0013_scheduled_jobs.sql`. If pg_cron is not
enabled the migration does not fail — it prints a notice and schedules
nothing, so watch for that message.

| Job | Schedule | Why |
|---|---|---|
| `expire-stale-holds` | every minute | Releases seats from abandoned checkouts |
| `refresh-homepage-stats` | hourly | Homepage counters |
| `refresh-popularity` | 02:15 daily | Listing rank |
| `complete-past-bookings` | 03:30 daily | Frees bookings for payout and review requests |

Confirm they are running:

```sql
select * from scheduled_job_status;
```

`last_status` should read `succeeded`. **If `expire-stale-holds` is not
running, seats held by abandoned checkouts are never released and your
inventory slowly disappears.** Check this after your first deploy.

The `/api/cron/*` routes still exist as a manual trigger, and for anyone on a
Vercel paid plan who prefers Vercel Cron. To use them instead, add to
`vercel.json`:

```json
"crons": [{ "path": "/api/cron/expire-holds", "schedule": "* * * * *" }]
```

They require `Authorization: Bearer $CRON_SECRET`.

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

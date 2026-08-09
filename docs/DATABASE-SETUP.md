# Connecting the database — start to finish

About 25 minutes. Do it in order; each step depends on the one before.

---

## 1. Create the Supabase project (5 min)

1. Go to <https://supabase.com>, sign up, **New project**
2. Name it anything. Choose a **strong database password and save it** — it is
   shown once and cannot be recovered, only reset.
3. **Region: Frankfurt (eu-central-1)** for GCC traffic. This is the one
   choice you cannot change later without recreating the project, and every
   checkout pays the round trip.

Provisioning takes about two minutes.

---

## 2. Create the tables (5 min)

The schema is 21 migrations. Rather than paste them one at a time, three
ready-made files live in `supabase/setup/`.

In Supabase: **SQL Editor → New query**. For each file, paste the whole
contents, press **Run**, wait for success, then move to the next.

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/setup/part-1-schema.sql` | Tables, enums, RLS, booking engine, CMS |
| 2 | `supabase/setup/part-2-schema.sql` | Permissions, auth functions, locations |
| 3 | `supabase/setup/part-3-seed.sql` | Countries, cities, categories, sample data |

**Part 1 must succeed before you run part 2.** The split is not cosmetic:
Supabase runs a pasted script as a single transaction, and Postgres refuses to
*use* an enum value in the same transaction that *added* it. Part 1 adds three
roles; part 2 uses them.

**Check it worked.** Table Editor should show `countries` with 6 rows and
`locations` with 48. Or run:

```sql
select
  (select count(*) from countries) as countries,
  (select count(*) from locations) as locations,
  (select count(*) from role_permissions) as permissions;
```

Expect **6 · 48 · 72**.

If you add migrations later, regenerate these files:

```bash
bash supabase/scripts/build-setup-files.sh
```

---

## 3. Enable pg_cron (1 min — do not skip)

**Database → Extensions** → search `pg_cron` → enable. Then re-run
`supabase/migrations/0013_scheduled_jobs.sql` in the SQL Editor.

Confirm:

```sql
select * from scheduled_job_status;
```

`expire-stale-holds` must be listed. **Without it, seats held by abandoned
checkouts are never released and your inventory quietly disappears.** The
migration does not fail when pg_cron is missing — it prints a notice and
schedules nothing, so it is easy to miss.

---

## 4. Copy your keys

**Project Settings → API.** Three values:

| Supabase calls it | Variable | Safe in the browser? |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes — RLS protects everything behind it |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | **No. Never.** |

The `service_role` key **bypasses every security rule in your database**.
Anyone holding it can read every traveller's details and every payment record.

Two rules, no exceptions:

- It never goes in a variable starting with `NEXT_PUBLIC_` — that prefix means
  "send this to the browser"
- It never goes in a file you commit

---

## 5. Local `.env.local`

In your project root:

```bash
cp .env.local.example .env.local
```

Open it and fill in:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

Notes that catch people out:

- The file is **`.env.local`**, not `.env`. Next.js reads `.env.local`.
- No quotes, no spaces around `=`.
- It must sit next to `package.json`, not inside `src/`.
- `.gitignore` already excludes it. Confirm before your next commit:
  ```powershell
  git status --short | Select-String "\.env" | Select-String -NotMatch "example"
  ```
  That must print nothing. (`.env.example` and `.env.local.example` *are*
  committed — they are empty templates.)

Then restart:

```bash
npm run dev
```

**The gold "Demo mode" banner should be gone.** That is the signal it worked.
If it is still there, the file name, location or key is wrong.

---

## 6. Vercel

Vercel never sees `.env.local` — that file stays on your machine.

**Project → Settings → Environment Variables.** Add four:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | same as local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as local |
| `SUPABASE_SERVICE_ROLE_KEY` | same as local |

Tick **Production, Preview and Development** for each.

Then **Deployments → ⋯ → Redeploy**. Environment variables are baked in at
build time, so adding them changes nothing until you rebuild. This is the most
common "it works locally but not live".

---

## 7. Set the auth redirect URLs

**Authentication → URL Configuration:**

- **Site URL:** `https://your-domain.vercel.app`
- **Redirect URLs:** add both
  - `https://your-domain.vercel.app/callback`
  - `http://localhost:3000/callback`

Without these, sign-in links land on the wrong host or are rejected outright.

---

## 8. Make yourself an admin

Follow [`LOGGING-IN.md`](LOGGING-IN.md). Short version: sign up at `/sign-up`,
then run `supabase/scripts/grant-admin.sql` with your email.

---

## Optional: Redis

Sign up at <https://upstash.com>, create a database, add
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

The site works without it — but **rate limiting is switched off**, so nothing
stops someone hammering your sign-in or checkout. Add it before you take real
bookings.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| Still shows "Demo mode" locally | Wrong file name, wrong folder, or the dev server was not restarted |
| Works locally, "Demo mode" on Vercel | Variables added after the last build. Redeploy. |
| `relation "countries" does not exist` | Part 1 did not finish. Re-run it and read the error. |
| `unsafe use of new value` | Parts 1 and 2 were pasted together. They must be separate runs. |
| Sign-in link goes to the wrong site | Step 7 not done. |
| Pages empty but no banner | Keys are set but the seed did not run. Run part 3. |

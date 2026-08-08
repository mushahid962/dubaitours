# Getting started — from these files to a live website

Written for someone who has not deployed a Next.js app before. Follow it in
order. Each part ends with something you can look at, so you always know
whether it worked.

There are four parts, and **you can stop after Part 2 and have a live
website.** Parts 3 and 4 connect the database and payments.

---

## Part 1 — Run it on your own computer (15 minutes)

### 1.1 Install Node.js

Go to <https://nodejs.org> and install the **LTS** version. Then check it:

```bash
node --version
```

You need **v20 or higher**. If you see something lower, install the LTS build.

### 1.2 Get the code running

Open a terminal, `cd` into the project folder, then:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

**You should see:** the homepage, with a gold banner reading "Showing demo
content". That banner is expected — there's no database yet, so the site is
showing eight placeholder destinations.

If you see it, everything works. That banner disappears in Part 3.

### Things that commonly go wrong

| What you see | What it means |
|---|---|
| `command not found: npm` | Node.js isn't installed, or the terminal needs restarting |
| `EADDRINUSE: port 3000` | Something else is using port 3000. Run `npm run dev -- -p 3001` |
| `Couldn't find any 'pages' or 'app' directory` | See below — this is almost always a stray lockfile |
| `7 vulnerabilities` after `npm install` | See below |

### "Couldn't find any `pages` or `app` directory"

Look at the line just above the error. If it says something like:

```
Warning: Next.js ignored package-lock.json in C:\Users\YourName
because it would include your home directory.
```

…then Next walked **up** from your project looking for a lockfile, found a
stray `package-lock.json` in your home folder, and decided *that* was the
project root — so it looked for `src/app` there and found nothing.

`next.config.ts` now pins the root explicitly:

```ts
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const nextConfig: NextConfig = { turbopack: { root: projectRoot }, ... };
```

If you still see it, delete the stray file. It has no business being there:

```powershell
del C:\Users\YourName\package-lock.json
```

Check you're in the right folder too — `dir` should show `package.json`,
`next.config.ts` and a `src` folder.

### "7 vulnerabilities (3 moderate, 2 high, 2 critical)"

First: check whether they affect your live site or only your build tools.

```bash
npm audit --omit=dev
```

`--omit=dev` excludes development tools, which never reach your visitors. If
that reports **0 vulnerabilities**, your deployed site is unaffected — the
warnings come from things like the test runner and the Supabase CLI.

This project reports 0 either way. If a future `npm install` brings some back,
fix them by updating the package that pulls them in:

```bash
npm ls tar --all      # find which package depends on it
npm install vitest@latest supabase@latest --save-dev
```

**Avoid `npm audit fix --force`.** It installs breaking major versions to
silence warnings and routinely breaks working projects — as its own output
warns.

### Fonts fail to load

| What you see | What it means |
|---|---|
| `Failed to fetch ... from Google Fonts` | Your network can't reach fonts.googleapis.com. Fonts here load via a stylesheet link, so this shouldn't block the build |

---

## Part 2 — Put it on the internet (20 minutes)

### 2.1 Push to GitHub

Create an **empty** repository on GitHub — no README, no .gitignore, since
this project already has one. Then, in your project folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

**Before you push, check that no secrets are going up:**

```bash
git status --short | grep ".env"
```

That must print **nothing**. `.gitignore` already excludes `.env.local`. If a
`.env` file ever appears in that output, stop and remove it — a leaked
service-role key gives anyone full access to your database.

### 2.2 Deploy on Vercel

1. Go to <https://vercel.com> and sign in **with GitHub**.
2. Click **Add New → Project**.
3. Find your repository and click **Import**.
4. Change nothing. Vercel detects Next.js on its own.
5. Click **Deploy**.

Wait two or three minutes.

**You should see:** a live URL like `your-project.vercel.app`, showing the
same homepage and the same demo banner.

**Your website is now live on the internet.** Every `git push` from here
redeploys it automatically.

---

## Part 3 — Connect the database (30 minutes)

This is what turns demo content into real tours, logins and bookings.

### 3.1 Create a Supabase project

1. Go to <https://supabase.com>, sign up, create a new project.
2. Choose a region close to your users — **Frankfurt** or **Mumbai** for the
   Gulf. This matters: every database round trip crosses that distance.
3. Save the database password somewhere safe. It is shown once.

Wait for the project to finish provisioning.

### 3.2 Create the tables

In the Supabase dashboard, open **SQL Editor**. Run these files **in order**,
one at a time, pasting the contents of each and clicking **Run**:

```
supabase/migrations/0001_extensions_enums.sql
supabase/migrations/0002_geography_identity.sql
supabase/migrations/0003_catalog.sql
supabase/migrations/0004_commerce.sql
supabase/migrations/0005_engagement_content_ads.sql
supabase/migrations/0006_search_and_functions.sql
supabase/migrations/0007_rls_policies.sql
supabase/migrations/0008_supplier_applications.sql
```

Order matters — later files reference tables the earlier ones create.

Then run `supabase/seed/seed.sql` to load six countries, ten cities, a
category tree and one complete sample tour. It's safe to run more than once.

**You should see:** under **Table Editor**, a `countries` table with 6 rows
and a `tour_departures` table with 120 rows.

### 3.3 Copy your keys

In Supabase: **Project Settings → API**. You need three values:

| Supabase calls it | Goes in |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses every security rule in the database. It goes
only in server environment variables — never in a file you commit, and never
in a variable whose name starts with `NEXT_PUBLIC_` (that prefix means "send
this to the browser").

### 3.4 Use them locally

Create a file called `.env.local` in the project root:

```bash
cp .env.local.example .env.local
```

Paste your three values in, then restart:

```bash
npm run dev
```

**You should see:** the gold demo banner is gone, and the destinations are
now coming from your database.

### 3.5 Use them on Vercel

Vercel does not read `.env.local` — that file never leaves your machine.

In Vercel: **Project → Settings → Environment Variables**. Add the same three,
plus `NEXT_PUBLIC_SITE_URL` set to your live URL. Tick all three environments
(Production, Preview, Development).

Then **Deployments → ⋯ → Redeploy**. Environment variables only apply to
builds that run after you add them.

### 3.6 Make yourself an admin

Sign in on your live site once, so an account exists. Then in the Supabase
**SQL Editor**:

```sql
update profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'you@example.com');
```

You can now open `/admin/applications`.

There is deliberately no button anywhere that makes someone an admin. This is
the account that can refund any booking and read every traveller's details,
so it is granted by hand, in the database, on purpose.

---

## Part 4 — Take payments (when you have real tours)

Do not start this until Parts 1–3 work and you have an operator listed.

1. Create a Stripe account and complete business verification.
2. Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in Vercel.
3. In Stripe: **Developers → Webhooks → Add endpoint**, pointing at
   `https://your-site.com/api/webhooks/stripe`.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**Test with Stripe's test card `4242 4242 4242 4242` before going live.**
A booking that takes money without confirming a seat is the worst bug this
system can have, and it is the one you must see working with your own eyes.

---

## Optional: Redis

Sign up at <https://upstash.com>, create a Redis database, and add
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

Without it, the site works — it just doesn't cache, and **rate limiting is
switched off**. That second part matters: with no rate limiting, nothing stops
someone hammering your sign-in or checkout. Add Upstash before you accept real
bookings.

---

## Where to go next

| Question | File |
|---|---|
| How does the whole system fit together? | `docs/ARCHITECTURE.md` |
| Who can do what, and why? | `docs/ACCESS-CONTROL.md` |
| How do we rank on Google? | `docs/SEO-PLAYBOOK.md` |
| What was actually tested? | `docs/VERIFICATION.md` |
| What gets built next? | `docs/ROADMAP.md` |

## A realistic expectation

What you have is a working foundation: the database, the security model, the
booking engine, the SEO layer, one full tour page and a homepage.

What is **not** built yet: search results, city pages, the checkout screens,
the supplier dashboard and the CMS. Those are in `docs/ROADMAP.md`. You'll be
able to deploy, sign in, and browse — but a traveller can't complete a booking
end to end yet.

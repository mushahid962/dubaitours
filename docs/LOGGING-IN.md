# Logging in and reaching the dashboards

## Before anything else

Logging in needs a real database. If `npm run dev` shows a gold "Demo mode"
banner, there are no accounts to log into yet — do Part 3 of
`GETTING-STARTED.md` first, then come back.

You need, in order:

1. Supabase project created
2. Migrations `0001` → `0021` run **in order** in the SQL Editor
3. `supabase/seed/seed.sql` run
4. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` set — locally in `.env.local`, and on Vercel
   under Settings → Environment Variables
5. Redeployed on Vercel **after** adding those variables

---

## Step 1 — create your account like any visitor

Go to `/sign-up` on your site and sign up with your real email.

You are now a **customer** with status **pending_verification**. That is
correct. Signing up does not make you an admin, and nothing in the interface
will ever offer to.

## Step 2 — confirm your email

Click the link Supabase emails you. Check spam.

**Not receiving it?** Supabase's free tier sends a small number of emails per
hour from a shared address, and they are often filtered. Two ways past it:

- Supabase Dashboard → **Authentication → Users** → find yourself → the menu
  on your row has a confirm option.
- Or run the script in step 3, which forces status to active anyway.

## Step 3 — make yourself a super admin

There is deliberately **no button anywhere** that grants admin. This is the
account that can refund any booking, read every traveller's details and change
what anyone else is allowed to do, so it is granted by hand.

Open `supabase/scripts/grant-admin.sql`, change the email in **both** places,
and run the whole file in the Supabase SQL Editor.

It prints your role and status, then lists your 19 permissions.

### Why the script sets two things

`role` decides **what** you may do. `status` decides **whether you may do
anything at all** — `has_permission()` returns false for any account that is
not `active`, whatever its role.

Setting the role alone leaves you a super admin who can do nothing and sees
404 everywhere. That is the single most likely reason "I set myself to admin
and still cannot get in".

## Step 4 — sign out and back in

Your role is read when the session loads. Sign out, sign in again.

## Step 5 — where to go

| URL | What it is | Who gets in |
|---|---|---|
| `/account` | Your profile, and your permission list | Everyone signed in |
| `/admin` | Platform dashboard | Internal roles |
| `/admin/team` | Users, roles, suspensions | `users.read`; only super admin may change roles |
| `/admin/locations` | The location hierarchy (Phase 2) | `settings.write` |
| `/admin/posts` | Blog and content | `content.write` |
| `/admin/applications` | Business applications waiting | Admin |
| `/admin/tours` | Listings waiting for review | Admin |
| `/dashboard/{company-slug}` | A business's own dashboard | Members of that business |

`/account` is the useful first stop: it lists your permissions, so you can see
immediately whether step 3 worked.

---

## When it does not work

### Everything under /admin returns 404

**This is the expected response, not a bug.** These routes return 404 rather
than 403 on purpose — a 403 confirms the admin area exists to whoever just
probed for it.

Check, in this order:

```sql
select p.role, p.status
from profiles p join auth.users u on u.id = p.id
where lower(u.email) = lower('you@example.com');
```

- `role = customer` → step 3 did not run, or ran against a different email
- `status <> active` → this is the trap; the script fixes it
- Both correct but still 404 → sign out and back in

### "Confirm your email address first"

Status is still `pending_verification`. Either click the link, confirm from
the Supabase dashboard, or run the script.

### "That email and password do not match an account"

The same message is shown for a wrong password and for an unknown address, on
purpose — distinct errors would turn the login form into a way of testing
which addresses have accounts. Use the reset link at `/forgot-password`.

### /dashboard shows nothing

Dashboards belong to a **business**, and you have not created one yet. Apply
at `/partner/apply`, then approve yourself at `/admin/applications`. Business
listings are Phase 4 — expect this to be thin until then.

### The site works locally but not on Vercel

Environment variables are baked in at build time. Adding them changes nothing
until you rebuild: **Deployments → ⋯ → Redeploy**.

---

## Giving other people access

Once you are a super admin, use `/admin/team` — no more SQL.

Ten roles are available. The ones that matter early:

- **content_manager** — posts, pages, locations. No money, no accounts.
- **booking_manager** — bookings and refunds. Cannot publish content.
- **support_agent** — read widely, change little.
- **admin** — everything operational, but **cannot assign roles**.

Only a **super admin** can change roles. That is deliberate: it means the
highest privilege on your platform is not self-replicating, so one compromised
admin account cannot mint more admins.

Keep at least two super admins. The database refuses to demote the last one —
otherwise a single click locks you out of your own platform with no way back
except direct SQL.

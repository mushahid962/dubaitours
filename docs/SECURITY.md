# Security architecture

## Threat model

A travel marketplace holds three things worth stealing: payment credentials,
traveller PII (including passport numbers for some suppliers), and money in
transit to operators. It also presents a fourth, less obvious target —
inventory itself, which can be griefed by holding seats without paying.

## Controls

### Authentication
- Supabase Auth: email OTP, phone OTP, Google, Apple. Passwords are never
  stored by us.
- JWTs in `httpOnly`, `Secure`, `SameSite=Lax` cookies, refreshed at the edge.
- Auth endpoints rate-limited to 5 attempts per 5 minutes per identity.
- Turnstile on sign-up, guest checkout and review submission.

### Authorisation
- RLS is enabled **and forced** on every table (`force row level security`, so
  even the table owner is subject to it).
- Policies are written against `auth.uid()` and three helpers — `is_admin()`,
  `is_staff()`, `is_company_member()` — so a policy bug is fixable in one place.
- Self-escalation is closed: the `profiles` update policy pins `role` to its
  current value.
- Service-role key is server-only and used by exactly three callers: payment
  webhooks, cron jobs, and admin mutations that have already checked a role.

### Input handling
- Zod schemas at every trust boundary. Nothing reaches a query without parsing.
- Parameterised queries throughout (PostgREST and RPC); no string-built SQL.
- React escapes by default; `dangerouslySetInnerHTML` is reserved for CMS
  content, which is sanitised with DOMPurify against an allowlist on write.

### Payments
- Card data never touches our servers — Stripe Elements and hosted flows only.
- Webhooks verify the provider signature before anything else, and every event
  is recorded in `payment_events` with a unique `(provider, event_id)`, so a
  replayed webhook is a no-op.
- `confirm_booking()` is idempotent: a duplicate delivery returns the existing
  confirmed booking instead of double-issuing tickets.
- Booking totals are recomputed server-side at capture and compared against
  the charged amount before confirmation.

### Inventory abuse
- Seat holds expire in 15 minutes and are reclaimed by `expire_stale_holds()`.
- Checkout is rate-limited to 8 attempts per minute per identity.
- Capacity is a database constraint (`seats_booked + seats_held <= capacity`),
  so even a logic bug cannot oversell.

### PII
- Passport numbers are encrypted at the application layer with a key held in
  the environment, decrypted only when a supplier manifest is generated.
- Supplier payout details are encrypted the same way.
- `audit_logs` records every admin read of traveller data.
- Deletion requests soft-delete the profile, hard-delete PII, and retain
  booking financials for the statutory period.

### Transport and headers
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{n}' …
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```
CSP uses per-request nonces. Third-party pixels are loaded from
`tracking_scripts` only after the visitor's consent category allows it.

### CSRF
Server Actions carry Next.js's built-in origin check. Route handlers that
mutate require a matching `Origin` header plus a double-submit token.

## Operational
- Migrations are forward-only and reviewed; no direct production SQL.
- Secrets live in Vercel and Supabase, rotated quarterly, never in the repo.
- Dependabot plus `pnpm audit` gate the build.
- Quarterly external penetration test; annual PCI SAQ-A attestation.

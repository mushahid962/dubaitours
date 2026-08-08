# Access control

## The three actors

| Actor | Becomes one by | Can do | Cannot do |
|---|---|---|---|
| **Traveler** | Signing up. Default role, no approval. | Book, pay, review what they booked, manage their own wishlist, wallet and profile | See anyone else's booking, review a tour they didn't take, list a business |
| **Company owner / staff** | Submitting an application that an admin approves | Manage their own company's tours, availability, pricing, bookings, payouts, staff | Touch another company's anything, approve themselves, change commission |
| **Admin** | Assigned directly in the database by an existing admin | Review applications, approve or reject operators, moderate reviews, refund, suspend, edit CMS | Nothing is technically blocked — which is why every admin action is written to `audit_logs` |

`editor` and `support` sit between traveler and admin: they can triage the
application queue and moderate content, but `approve_company_application`
refuses them. Approval creates a company and changes someone's role, so it is
restricted to `admin` and `super_admin`.

## The dangerous transition

Traveler → company owner is the only path in the system where a person gains
power over data that isn't theirs. It is closed in four independent ways, and
any one of them alone would be enough:

1. **`profiles` update policy** pins the role: `with check (role = auth_role())`.
   A traveller writing their own row cannot change what they are.
2. **`company_applications` update policy** lets an applicant edit a draft's
   *content* but never its `status`, `reviewed_by` or `company_id`.
3. **Every state transition is a function.** `submit_company_application`,
   `approve_company_application`, `reject_company_application` and
   `request_application_info` are the only writers of `status`.
4. **Each definer function re-checks the caller.** `approve_company_application`
   opens with `if not is_admin() then raise insufficient_privilege`. A
   `security definer` function without its own check is a privilege-escalation
   hole with extra steps.

All four are exercised in `supabase/tests/03_actor_boundaries.sql`, which
attempts the escalation three ways and asserts each is refused.

## What approval actually does

```
application (submitted)
        │  admin calls approve_company_application(id, commission_rate, note)
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ 1. re-check is_admin()                              │
  │ 2. resolve a collision-free public slug             │
  │ 3. insert companies (status active, verified)       │
  │ 4. insert company_members (applicant as owner)      │
  │ 5. promote profiles.role, but only from 'traveler'  │
  │ 6. stamp the application approved + reviewer + time │
  │ 7. write audit_logs                                 │
  └─────────────────────────────────────────────────────┘
        ▼
  operator live at /operator/{slug}
```

One transaction. If any step fails the whole thing rolls back, so there is no
state where a company exists but its owner can't reach it.

Step 5 is `where role = 'traveler'` on purpose: an admin who also runs a tour
company must not be demoted to `company_owner` by approving their own listing.

Re-running the function on an already-approved application returns the
existing company rather than creating a second one. Admin tools get
double-clicked.

## Suspension

`suspend_company()` pauses every published tour in the same transaction as the
status change. Doing it in a follow-up job leaves a window where a suspended
operator is still selling, and each booking taken in that window is a refund
and an angry traveller.

## Where enforcement lives

RLS is the boundary. The helpers in `src/lib/auth/session.ts` —
`requireActor`, `requireAdmin`, `requireCompany`, `can` — exist to render the
right UI and produce a clear error, not to secure anything. If every one of
them were deleted, the database would still return zero rows to the wrong
person. Treat a missing guard as a UX bug; treat a missing policy as an
incident.

Two consequences worth knowing:

- Admin routes redirect to 404, not 403. A 403 confirms the URL exists to
  someone probing for it.
- `getActor()` calls `supabase.auth.getUser()`, which verifies the JWT with
  the auth server. `getSession()` reads the cookie without validating it and
  is never used for an authorisation decision.

## Trigger functions

Postgres runs trigger functions with the *caller's* privileges unless told
otherwise. Four in this schema had to be `security definer`, and each failed
loudly in testing before it was fixed:

| Trigger | Why it needs definer |
|---|---|
| `internal.reindex_from_tour` / `_child` | A supplier has no `usage` on the `internal` schema, by design |
| `internal.set_booking_reference` | Same |
| `internal.recalc_tour_rating` | A traveller publishing a review must update aggregates on `tours` and `companies`, which their policies forbid writing |
| `internal.log_application_event` | An audit trigger that depends on the actor's grants is one the actor can break |

The general rule: if a trigger writes anywhere the triggering user has no
policy for, it needs definer — and it needs its own check on who may call it.

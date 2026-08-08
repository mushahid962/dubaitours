# Roadmap

## Phase 1 — Prove the loop (months 1–3)

One country, one language, real inventory. The goal is a booking that a
stranger completes without help.

- UAE only; English only
- 20–30 vetted Dubai and Abu Dhabi operators
- Search, listing, tour page, guest checkout, Stripe
- Supplier dashboard: tours, availability, bookings, payouts
- Admin: approvals, moderation, refunds
- Verified reviews
- Programmatic pages for Dubai and Abu Dhabi city × category only

Ship gate: 100 completed bookings, refund rate under 5%, checkout completion
above 45%.

## Phase 2 — Language and depth (months 4–6)

Arabic, done properly. This is the differentiator, so it gets a phase to
itself rather than a checkbox.

- Native Arabic with RTL, human-reviewed translations, Arabic-slug URLs
- Hindi and Urdu
- Saudi Arabia and Qatar launch
- Wishlist, wallet, coupons, gift cards
- Blog and destination guides with real author entities
- Featured listings and the house ad server
- Regional payment gateways (Tap, HyperPay)

Ship gate: Arabic organic traffic ≥ 25% of English, first supplier renewing a
featured slot.

## Phase 3 — Scale the surface (months 7–12)

- Oman, Bahrain, Kuwait
- AI itinerary planner and travel assistant
- AI review summaries and FAQ drafting, human-approved before publish
- Affiliate verticals: hotels, transfers, insurance, eSIM
- Supplier memberships
- Mobile apps (React Native, sharing the API)
- Public affiliate API

## Phase 4 — Defensibility (year 2)

- Channel-manager integrations (Bokun, Rezdy, TourCMS) so suppliers stop
  double-entering inventory — the real switching cost in this market
- Dynamic pricing recommendations for operators
- B2B portal for hotel concierges and DMCs
- Loyalty programme
- Expansion beyond the GCC: Jordan, Egypt, Turkey

## Deliberately not yet

- **Flights.** Margins are thin, complexity is enormous, and it's a different
  business. Affiliate only.
- **Public API before Phase 3.** A public contract is far harder to change
  than an internal one, and the schema will still be moving.
- **Native apps before Phase 3.** A fast mobile web experience serves a
  destination marketplace better than an app nobody installs before a trip.
- **Microservices.** A modular monolith on Postgres handles the traffic this
  business will realistically see for years. Splitting early buys distributed
  transactions and buys nothing else.

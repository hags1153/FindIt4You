# FindIt4You — build roadmap

Living plan. ✅ done · 🚧 in progress · ⏭️ next · 💭 needs a product decision.

## Shipped
- ✅ **Live** at https://findit4you.com (PM2 + nginx + TLS, isolated from RaceScan).
- ✅ **Accounts** — Supabase Auth signup/login/logout, sessions, profiles + roles.
- ✅ **Marketplace core** — post / browse / claim / advance (`open→claimed→found→completed`),
  server-side authorization.
- ✅ **Security pass v1** — per-IP rate limiting, input validation/clamping, request-size cap,
  nginx security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- ✅ **Uploads foundation** — private `proofs` Storage bucket + signed upload URLs
  (`POST /api/uploads/sign`), photos stored per-find, time-limited signed display URLs.
- ✅ **Chat foundation** — `GET/POST /api/finds/:id/messages`, restricted to the buyer & finder.

## Next (backend done → wire the UI)
- 🚧 **Image uploader UI** — file picker in the "mark found" step: pick photo → upload to the
  signed URL → attach path on advance. (Backend ready; UI pending.)
- 🚧 **Chat UI** — a thread panel on claimed/active finds. (Backend ready; UI pending.)
- ⏭️ **Realtime** — Supabase Realtime so new messages / status changes appear live without refresh.

## Accounts & onboarding 🚧 (building now)
- ✅ **Schema** — profiles get full contact info (phone, address, verification flag) + onboarding flag;
  `wallets` + append-only `wallet_entries` ledger (the "Pre-Load" foundation); `watchlist`.
- 🚧 **Full-info signup** — name, email, password, phone, address, role (**buyer / finder / both / not sure yet**).
- 🚧 **Buyer/Finder as the main nav** on the landing page (two audience paths → signup).
- 🚧 **Pre-Load nudge** — after signup, strongly urge adding funds (no card required at signup);
  real funding lands with Stripe.
- ⏭️ **My Account page** — Current Buys, Past Orders, Watchlist, wallet balance, profile edit.
- 💭 **Phone verification via Twilio** — TODO (Verify API: send code → confirm → set `phone_verified`).

## Receipt validator 💭 (decision needed)
Uploads land as images already. What should "validate" mean? Options, cheapest → richest:
1. **Manual review** — buyer eyeballs the receipt photo before releasing escrow. (Ship now, zero cost.)
2. **OCR extract** — pull the total + store name off the receipt (e.g. Tesseract, or a vision model)
   and check the total ≤ the buyer's max price; flag mismatches.
3. **Authenticity checks** — dedupe receipts (same receipt reused), detect edits, match date/merchant.
→ Recommend starting at (1) now, layering (2) once real receipts exist to test against.

## Payments 💭 (the big one — was the agreed "Stripe next")
- **Stripe Connect** — hold buyer funds in escrow on claim; release cost + finder's fee on completion;
  onboarding for Finders (payout accounts). `transactions` table + `stripe_*` columns already exist.
- **Stripe Billing** — subscriptions/memberships (for when Jayme drives signups).

## Trust & quality
- ⏭️ **Reviews/ratings write path** — table exists; ratings shown today are seeded.
- 💭 **Finder verification** — ID/phone verification badge; dispute flow for escrow.
- 💭 **Notifications** — email/push when a find is claimed / found / messaged.

## Ops / hardening (later)
- Remove demo accounts before real launch (or gate behind an env flag).
- Backups: Supabase Pro has PITR — confirm retention.
- Add a `/healthz` endpoint + uptime monitoring (tie into jarvis dashboard).
- Rotate the Supabase service key + sudo credential shared during setup.

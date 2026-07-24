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

## Next
- ⏭️ **Realtime** — swap chat's 5s polling for Supabase Realtime; live status changes.
- ⏭️ **Deploy accounts to prod** — apply migrations 002/003 to cloud + `pm2 restart` (needs cloud DATABASE_URL).

## Accounts & onboarding ✅ (built locally, tested)
- ✅ **Schema** — profiles full contact info + onboarding flag; `wallets` + append-only
  `wallet_entries` ledger; `watchlist`.
- ✅ **Full-info signup** — name, email, password, phone, address, role (**buyer / finder / both / not sure yet**),
  inline validation, in a polished modal.
- ✅ **Buyer/Finder as the main nav** — hero + CTA adapt per audience; CTA opens signup pre-set to that role.
- ✅ **Pre-Load** — post-signup nudge + demo wallet deposit → `wallet_entries` ledger + cached balance
  (no card; real funding = Stripe). Wallet balance/ledger endpoints + nav wallet chip.
- ✅ **My Account page** — Overview, Current Buys, Past Orders, Finder Jobs, Watchlist, Wallet (ledger),
  Profile (edit). One `/api/account` call.
- ✅ **Image uploader UI** — file picker in "mark found" → client-side canvas resize/compress (~1200px JPEG)
  → signed upload → photo attached; renders on cards.
- ✅ **Chat UI** — thread panel on active finds (5s polling refresh).
- ✅ **Watchlist UI** — heart toggle on cards + Watchlist tab.
- ✅ **Receipt review (manual)** — buyer sees proof photo + note and explicitly confirms before releasing escrow.
- 💭 **Phone verification via Twilio** — TODO (Verify API: send code → confirm → set `phone_verified`). NOT built.
- 💭 **Receipt OCR / authenticity** — TODO (see Receipt validator below). NOT built.

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

# FindIt4You

A **reverse marketplace / personal-shopper platform**: buyers post exactly what they want (a "find"),
**Finders** go get it, and payment is held in **escrow** until the item is proven and handed off. Built to
turn the mess of TJ Maxx / Marshalls / HomeGoods "ISO" Facebook groups into something structured and safe.

Early build for Ryan & Jayme.

## Stack (v0.2)

- **Node** http server (`server.js`) — serves the web app + a JSON API.
- **Supabase** — Postgres database + Auth (email/password). Server talks to the DB with the
  service-role key; the browser signs in with the anon key and sends its session token to the API.
- **Front end** — vanilla HTML/CSS/JS in `public/` (Supabase JS served locally from `public/vendor/`).

## Run it

```bash
cd ~/Documents/repos/findit4you
npm install          # first time only (@supabase/supabase-js, dotenv)
cp .env.example .env # then fill in your Supabase URL + keys (Settings → API)
node server.js
# → http://localhost:4200
```

### Demo logins (seeded)

Run `node scripts/seed.js` to (re)load demo users + finds. All demo accounts use password **`findit4you-demo`**:

- `jayme@demo.findit4you.app` — a Finder (role: both, ⭐ 4.9)
- `ashley@demo.findit4you.app` — a buyer

Or just **Sign up** on the page — email confirmation is off, so you're logged in immediately.

## What works now

- **Real accounts** — signup / login / logout via Supabase Auth; sessions persist.
- **Browse** finds (open to everyone). **Post** a find, **claim** one, mark it **found** (+proof),
  **confirm handoff** to release escrow — all persisted in Postgres, all gated by who you are.
- **Escrow badge** on every card: none held → 🔒 held → ✅ released. **Status:** `open → claimed → found → completed`.
- Authorization enforced server-side (can't post logged-out, can't claim your own find, only the
  buyer/finder on a find can advance it).

## Files

```
findit4you/
  server.js            Node http server + Supabase-backed JSON API
  db/
    schema.sql         Postgres schema (run in Supabase SQL editor / via Mgmt API)
    client.js          service-role Supabase client + token verification
  scripts/
    seed.js            demo users + finds
  public/
    index.html         landing + live marketplace + auth modal
    styles.css
    app.js             Supabase Auth + authenticated API calls
    vendor/supabase.js Supabase JS (served locally)
  .env                 secrets (gitignored)
  README.md
```

## API

| Method | Route                          | Auth    | Purpose                         |
|--------|--------------------------------|---------|---------------------------------|
| GET    | `/api/config`                  | public  | supabase URL + anon key for the browser |
| GET    | `/api/requests`                | public  | list all finds                  |
| GET    | `/api/me`                      | user    | current profile                 |
| POST   | `/api/profile`                 | user    | update role / name / region     |
| POST   | `/api/requests`                | user    | create a find (buyer)           |
| POST   | `/api/requests/:id/claim`      | user    | finder claims a find            |
| POST   | `/api/requests/:id/advance`    | user    | move status forward (+ proof)   |

## Next steps

- **Stripe** — Connect for real escrow (hold buyer funds, pay the Finder on completion) + Billing for subscriptions.
- **Photo upload** — Supabase Storage for proof photos (proof is text today).
- **Messaging** between buyer & finder on a find (table exists).
- **Reviews/ratings** write path (table exists; ratings shown today are seeded).
- Narrow launch: one region, one niche, Jayme's existing customers first.

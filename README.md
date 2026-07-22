# FindIt4You

A **reverse marketplace / personal-shopper platform**: buyers post exactly what they want (a "find"),
**Finders** go get it, and payment is held in **escrow** until the item is proven and handed off. Built to
turn the mess of TJ Maxx / Marshalls / HomeGoods "ISO" Facebook groups into something structured and safe.

Early prototype for Ryan & Jayme to kick ideas around.

## Run it

```bash
cd ~/scout          # (local folder name; repo is FindIt4You)
node server.js
# → http://localhost:4200
```

Zero dependencies — pure Node (v22). No `npm install` needed.

## What the demo shows

- **Buyer view** — post a find (item, size, max price, finder's fee, deadline, region).
- **Finder view** — browse open finds, `claim` one, mark it `found` (add photo/receipt proof),
  then `confirm handoff` to release escrow.
- **Escrow badge** on every card shows funds state: none held → held → released.
- **Status flow:** `open → claimed → found → completed`.
- **Reset demo** button reseeds the sample data.

## Files

```
FindIt4You/
  server.js           zero-dep Node http server + JSON API
  data/requests.json  the tiny "database" (auto-seeded)
  public/
    index.html        landing page + how-it-works + live demo
    styles.css
    app.js            demo logic (fetch → API)
  README.md
```

## API (for when we build for real)

| Method | Route                          | Purpose                          |
|--------|--------------------------------|----------------------------------|
| GET    | `/api/requests`                | list all finds                   |
| POST   | `/api/requests`                | create a find (buyer)            |
| POST   | `/api/requests/:id/claim`      | finder claims a find             |
| POST   | `/api/requests/:id/advance`    | move status forward (+ proof)    |
| POST   | `/api/reset`                   | reseed demo data                 |

## Next steps (not built yet — these are the real product)

- **Stripe Connect** for actual escrow (hold buyer funds, release to the Finder on completion).
- Auth + real Finder profiles with ratings/reviews.
- Photo upload (currently proof is text).
- Real-time notifications when a find is claimed / found.
- Narrow launch: one region, one niche (TJ Maxx/Marshalls finds), Jayme's existing customers first.

# Hometown Seed web app

Next.js app for campaigns, matching, pooling and invites, running on the same Postgres
(Supabase) database the Census pipeline fills.

## Run it

```bash
cd web
cp .env.example .env.local     # DATABASE_URL = your Supabase Session pooler string
npm install
npm run dev                    # http://localhost:3000
```

The database tables and functions come from `../sql/` and are applied by the pipeline
(`zipgive migrate` or the "Refresh Census data" workflow). Run that once before starting the app.

## Deploy (Vercel)

1. Import the GitHub repo in Vercel and set **Root Directory** to `web`.
2. Add environment variables: `DATABASE_URL` and `NEXT_PUBLIC_SITE_URL`.
3. Deploy.

## What's where

| Path | Purpose |
|---|---|
| `app/page.tsx` | Home: hero, national map, campaigns |
| `app/start/` + `components/Builder.tsx` | Campaign builder: ZIPs, age group, goal, mode, live matches |
| `app/c/[slug]/` | Campaign page: progress, Treasury readiness, pledges, matches, pooling, invites |
| `app/zip/[zip]/` | ZIP profile and campaigns covering it |
| `app/api/` | JSON API used by the pages (and future mobile apps) |
| `lib/queries.ts` | All database reads |
| `lib/auth.ts` | Email + password sign-in (scrypt hashes, server sessions, rate limiting). Add email verification and password reset before public launch |
| `app/profile/`, `components/ProfileForm.tsx` | Giving profile: places, radius, cash/stock/DAF, budget, $ per child, age group, area income focus |
| `app/match/`, `components/SwipeDeck.tsx` | Swipe deck of campaigns and givers, ranked by location, then $ per child (`match_deck` in `sql/005`) |
| `app/connections/` | Mutual matches, saved campaigns, invites; start a campaign together |
| `middleware.ts` | Sends signed-out visitors from gated pages to sign-in |
| `lib/payments.ts` | **Prototype** payments seam (pledges only). Connect the charity's processor here |

## Tests

```bash
BASE_URL=http://localhost:3000 npm run test:api   # end-to-end API test against a running app
```

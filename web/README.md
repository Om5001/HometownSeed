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
2. Add environment variables from `.env.example`: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `AUTH_PEPPER`.
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
| `lib/auth.ts` | Accounts: Argon2id password hashing (64 MiB, 3 passes) with optional pepper, smart lockout (progressive delays, 15-minute lock after 10 failures, per-IP limit), hashed session and email tokens, email verification, password reset, change password, sign out everywhere, account deletion |
| `lib/email.ts` | Sends verification and reset emails through Resend; prints links in development |
| `sql/006_auth_security.sql` | Token tables, account deletion rules, and row-level security that blocks Supabase's public REST API from every table |
| `scripts/migrate.mjs` | Applies `../sql` to the database; runs automatically before `npm run dev` |
| `app/profile/`, `components/ProfileForm.tsx` | Giving profile: places, radius, cash/stock/DAF, budget, $ per child, age group, area income focus |
| `app/match/`, `components/SwipeDeck.tsx` | Swipe deck of campaigns and givers, ranked by location, then $ per child (`match_deck` in `sql/005`) |
| `app/connections/` | Mutual matches, saved campaigns, invites; start a campaign together |
| `middleware.ts` | Sends signed-out visitors from gated pages to sign-in |
| `lib/payments.ts` | **Prototype** payments seam (pledges only). Connect the charity's processor here |

## Tests

```bash
BASE_URL=http://localhost:3000 npm run test:api   # end-to-end API test against a running app
```

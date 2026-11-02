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
2. Add environment variables: `DATABASE_URL`, `SESSION_SECRET` (random, 32+ chars), `NEXT_PUBLIC_SITE_URL`.
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
| `lib/auth.ts` | **Prototype** sign-in (email only). Replace with Supabase Auth before launch |
| `lib/payments.ts` | **Prototype** payments seam (pledges only). Connect the charity's processor here |

## Tests

```bash
BASE_URL=http://localhost:3000 npm run test:api   # end-to-end API test against a running app
```

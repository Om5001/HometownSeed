# zip-giving-data

Data pipeline that estimates how many children (likely Trump Account beneficiaries)
live in each U.S. ZIP code, loads it into Postgres, and exposes SQL functions your
platform can query on demand: per-ZIP estimates, age-range filters, an area check
against the proposed 5,000-beneficiary minimum and income test, and nearby-ZIP suggestions.

> **These are estimates.** Treasury counts the actual account beneficiaries in a
> qualified class on each contribution's record date, using IRS election and trustee
> records that aren't public. Present these numbers to donors as estimates.

## Data sources

| Table | Source | What it gives you |
|---|---|---|
| `acs_zcta_children` | Census ACS 5-year API: B09001, B05003, B19013 | Under-18s by age bucket, citizen share, median household income, per ZCTA |
| `zcta_geo` | Census Gazetteer ZCTA file | Centroid lat/lon and land area (maps, radius search) |
| `zip_to_zcta` *(optional)* | ZIP→ZCTA crosswalk CSV (e.g. UDS Mapper) | Maps PO-box and single-business ZIPs to the ZCTA around them |

---

## Step-by-step setup

### 1. Get a Census API key (free, about 2 minutes)
Sign up at https://api.census.gov/data/key_signup.html. The key arrives by email,
and you must click the activation link before it works.

### 2. Get a Postgres database
- **Local:** `docker compose up -d` (uses the included `docker-compose.yml`)
- **Hosted:** Supabase, Neon, or RDS all work. Copy the connection string.

### 3. Configure
```bash
cp .env.example .env      # then fill in CENSUS_API_KEY and DATABASE_URL
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

### 4. Load the data
```bash
zipgive refresh                 # ACS 2024 5-year + 2024 Gazetteer, about 33k ZCTAs
# optional: ZIP->ZCTA crosswalk
zipgive load-crosswalk path/to/ZIPCodetoZCTACrosswalk.csv
```
Every load is an idempotent upsert and is logged in `pipeline_runs`.

### 5. Query it
```bash
zipgive query 11234 11236 --min-age 2 --max-age 8
zipgive suggest 11234           # grow an area to reach 5,000 beneficiaries
```

### 6. Push to GitHub and automate
```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```
In the repo, go to **Settings → Secrets and variables → Actions** and add the secrets
`CENSUS_API_KEY` and `DATABASE_URL`. You can optionally add a repo variable `ACS_YEAR`.
- `.github/workflows/ci.yml` runs the tests against a throwaway Postgres on every push.
- `.github/workflows/refresh-data.yml` refreshes the data monthly. You can also run it
  manually from the Actions tab and choose the ACS year. ACS 5-year data is released
  each December; when the next one comes out, change `ACS_YEAR` to the new year.

---

## Querying from your app

All of these are plain SQL functions. On Supabase you can also call them over
REST/RPC, for example `supabase.rpc('evaluate_area', {...})`.

```sql
-- Per-ZIP estimates for kids aged 2-8
select * from zip_child_estimates(array['11234','11236'], 2, 8);

-- Does this donation area qualify?
select * from evaluate_area(
  p_zips => array['11234','11236'],
  p_min_age => 2, p_max_age => 8,
  p_income_threshold => 160000,     -- IRC 414(q) HCE amount: verify the current year
  p_min_beneficiaries => 5000);

-- ZIPs within 5 miles, and an auto-built area that reaches 5,000
select * from nearby_zctas('11234', 5);
select * from suggest_area('11234', 5000);
```

Python (e.g. FastAPI):
```python
with psycopg.connect(DATABASE_URL) as conn:
    row = conn.execute("select * from evaluate_area(%s, %s, %s)", (zips, 2, 8)).fetchone()
```

### Output columns
- `est_children`: all children in the age range
- `est_eligible_children`: same, adjusted by the ZCTA's share of under-18s who are U.S. citizens
- `est_eligible_u18`: citizen-adjusted under-18s. This is the figure checked against the 5,000 minimum.
- `total_u18_moe`: Census margin of error (90%). Small ZIPs can have large error.

## How the estimate works
1. **Age range:** ACS buckets (0–2, 3–4, 5, 6–8, 9–11, 12–14, 15–17) are split
   evenly by single year of age for any requested range. Under-18s in group quarters
   are spread across all 18 ages.
2. **Eligibility:** the result is multiplied by (native + naturalized citizens under 18) ÷ (all under 18)
   from B05003.
3. **ZIP vs ZCTA:** without a crosswalk loaded, a ZIP is treated as the ZCTA with the
   same number. That holds for most residential ZIPs. Load a crosswalk to cover
   PO-box and unique ZIPs.

## Known limits / next steps
- **Contiguity:** the proposed rules require included ZIPs to touch and not surround
  excluded ZIPs, unless every ZIP passes the income test. `suggest_area` picks ZIPs by
  distance, not adjacency. To check contiguity, load the Census ZCTA shapefile
  (TIGER/Line) into PostGIS and use `ST_Touches`.
- **Treasury rules are still in proposed form.** Before taking donations, check the
  5,000 threshold, the income test, and the 414(q) amount against the final regulations.
- **ACS data lags 1–2 years** and does not reflect accounts actually opened or activated.

## Tests
```bash
pytest                                   # unit tests
TEST_DATABASE_URL=postgresql://... pytest # + SQL integration tests (drops/recreates public schema!)
```

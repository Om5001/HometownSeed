"""Census Bureau ACS 5-year client for ZCTA-level child population data."""
from __future__ import annotations

import logging
from typing import Iterable

import httpx

log = logging.getLogger(__name__)

ACS_URL = "https://api.census.gov/data/{year}/acs/acs5"
GEO_ZCTA = "zip code tabulation area"

# Output column -> Census variables summed to produce it.
VARIABLES: dict[str, list[str]] = {
    # B09001: Population under 18 years by age (in households)
    "age_0_2": ["B09001_003E"],
    "age_3_4": ["B09001_004E"],
    "age_5": ["B09001_005E"],
    "age_6_8": ["B09001_006E"],
    "age_9_11": ["B09001_007E"],
    "age_12_14": ["B09001_008E"],
    "age_15_17": ["B09001_009E"],
    "group_quarters_u18": ["B09001_010E"],
    "total_u18": ["B09001_001E"],
    "total_u18_moe": ["B09001_001M"],
    # B05003: Sex by age by nativity and citizenship status (male + female, under 18)
    "citizen_u18": ["B05003_004E", "B05003_006E", "B05003_015E", "B05003_017E"],
    "noncitizen_u18": ["B05003_007E", "B05003_018E"],
    # B19013: Median household income
    "median_hh_income": ["B19013_001E"],
}

COLUMNS = ["zcta", "acs_year", *VARIABLES.keys()]


def all_census_vars() -> list[str]:
    seen: list[str] = []
    for vs in VARIABLES.values():
        for v in vs:
            if v not in seen:
                seen.append(v)
    return seen


def _to_int(value: str | None) -> int | None:
    """Census uses large negative sentinels (e.g. -666666666) for 'no estimate'."""
    if value is None or value == "":
        return None
    try:
        n = int(float(value))
    except ValueError:
        return None
    return None if n < 0 else n


def _sum(values: Iterable[int | None]) -> int | None:
    vals = list(values)
    if all(v is None for v in vals):
        return None
    return sum(v or 0 for v in vals)


def parse_response(payload: list[list[str]], year: int) -> list[dict]:
    """Turn the Census API's [header, *rows] JSON into typed records."""
    if not payload:
        return []
    header, *rows = payload
    idx = {name: i for i, name in enumerate(header)}
    if GEO_ZCTA not in idx:
        raise ValueError(f"Response missing '{GEO_ZCTA}' column: {header}")

    records = []
    for row in rows:
        rec: dict = {"zcta": row[idx[GEO_ZCTA]].zfill(5), "acs_year": year}
        for col, vars_ in VARIABLES.items():
            rec[col] = _sum(_to_int(row[idx[v]]) if v in idx else None for v in vars_)
        records.append(rec)
    return records


def fetch_zcta_children(
    year: int,
    api_key: str | None = None,
    zctas: list[str] | None = None,
    client: httpx.Client | None = None,
    timeout: float = 180.0,
) -> list[dict]:
    """Fetch child population estimates for all ZCTAs (or a subset)."""
    params = {
        "get": ",".join(all_census_vars()),
        "for": f"{GEO_ZCTA}:{','.join(zctas) if zctas else '*'}",
    }
    if api_key:
        params["key"] = api_key

    own = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=True)
    try:
        log.info("Requesting ACS %s ZCTA data (%s)", year, "all" if not zctas else len(zctas))
        resp = client.get(ACS_URL.format(year=year), params=params)
        if resp.status_code != 200 or not resp.text.lstrip().startswith("["):
            raise RuntimeError(
                f"Census API error {resp.status_code}: {resp.text[:300]}"
                " (an invalid key returns an HTML page; check CENSUS_API_KEY)"
            )
        return parse_response(resp.json(), year)
    finally:
        if own:
            client.close()

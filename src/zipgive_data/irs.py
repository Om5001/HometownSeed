"""IRS Exempt Organizations Business Master File (EO BMF) extract.

The IRS has no public API for its Tax Exempt Organization Search; it publishes the
same data as CSV files, one per state, refreshed about monthly:
https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
Codes are explained in https://www.irs.gov/pub/irs-soi/eo-info.pdf
"""
from __future__ import annotations

import csv
import io
import logging

import httpx

log = logging.getLogger(__name__)

STATE_URL = "https://www.irs.gov/pub/irs-soi/eo_{st}.csv"
STATES = ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY "
          "NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY").split()
COLUMNS = ["ein", "name", "street", "city", "state", "zip", "subsection", "deductibility", "ruling",
           "foundation", "status", "ntee_cd", "asset_amt", "income_amt", "revenue_amt"]


def _int(v: str | None) -> int | None:
    v = (v or "").strip()
    try:
        return int(v) if v else None
    except ValueError:
        return None


def parse_bmf(text: str, only_501c3: bool = True) -> list[dict]:
    """Parse one EO BMF CSV. Keeps 501(c)(3)s only unless told otherwise."""
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        r = {k.strip().upper(): (v or "").strip() for k, v in r.items() if k}
        sub = r.get("SUBSECTION", "").zfill(2) if r.get("SUBSECTION") else None
        if only_501c3 and sub != "03":
            continue
        ein = r.get("EIN", "").replace("-", "").zfill(9)
        if len(ein) != 9 or not ein.isdigit() or not r.get("NAME"):
            continue
        rows.append({
            "ein": ein, "name": r["NAME"], "street": r.get("STREET") or None, "city": r.get("CITY") or None,
            "state": (r.get("STATE") or None) and r["STATE"][:2], "zip": r.get("ZIP") or None,
            "subsection": sub, "deductibility": r.get("DEDUCTIBILITY") or None, "ruling": r.get("RULING") or None,
            "foundation": r.get("FOUNDATION") or None, "status": r.get("STATUS") or None, "ntee_cd": r.get("NTEE_CD") or None,
            "asset_amt": _int(r.get("ASSET_AMT")), "income_amt": _int(r.get("INCOME_AMT")), "revenue_amt": _int(r.get("REVENUE_AMT")),
        })
    return rows


def fetch_state(st: str, client: httpx.Client | None = None) -> list[dict]:
    st = st.strip().lower()
    if st.upper() not in STATES:
        raise ValueError(f"unknown state {st!r}")
    own = client is None
    client = client or httpx.Client(timeout=120, follow_redirects=True, headers={"user-agent": "zipgive-data/1.0"})
    try:
        r = client.get(STATE_URL.format(st=st))
        r.raise_for_status()
        return parse_bmf(r.content.decode("utf-8", errors="replace"))
    finally:
        if own:
            client.close()

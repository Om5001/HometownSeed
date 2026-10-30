"""Census Gazetteer (ZCTA centroids) and ZIP->ZCTA crosswalk loaders."""
from __future__ import annotations

import csv
import io
import logging
import zipfile
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

GAZETTEER_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
    "{year}_Gazetteer/{year}_Gaz_zcta_national.zip"
)


def parse_gazetteer(text: str, year: int) -> list[dict]:
    """Parse the tab-delimited Gazetteer ZCTA file (headers may have stray spaces)."""
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    header = [h.strip().upper() for h in next(reader)]
    idx = {h: i for i, h in enumerate(header)}
    out = []
    for row in reader:
        if not row or not row[0].strip():
            continue
        row = [c.strip() for c in row]
        out.append({
            "zcta": row[idx["GEOID"]].zfill(5),
            "lat": float(row[idx["INTPTLAT"]]),
            "lon": float(row[idx["INTPTLONG"]]),
            "land_sqmi": float(row[idx["ALAND_SQMI"]]) if "ALAND_SQMI" in idx else None,
            "gazetteer_year": year,
        })
    return out


def fetch_gazetteer(year: int, client: httpx.Client | None = None) -> list[dict]:
    own = client is None
    client = client or httpx.Client(timeout=180, follow_redirects=True)
    try:
        url = GAZETTEER_URL.format(year=year)
        log.info("Downloading %s", url)
        resp = client.get(url)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            name = next(n for n in zf.namelist() if n.endswith(".txt"))
            text = zf.read(name).decode("utf-8-sig", errors="replace")
        return parse_gazetteer(text, year)
    finally:
        if own:
            client.close()


# Column aliases so crosswalks from different publishers load without edits
# (UDS Mapper: ZIP_CODE, PO_NAME, STATE, ZIP_TYPE, ZCTA).
_ALIASES = {
    "zip": ["ZIP_CODE", "ZIP", "ZIPCODE", "USPS_ZIP"],
    "zcta": ["ZCTA", "ZCTA5", "ZCTA5CE20", "ZCTA5CE"],
    "po_name": ["PO_NAME", "CITY", "USPS_ZIP_PREF_CITY"],
    "state": ["STATE", "STATE_ABBR", "USPS_ZIP_PREF_STATE"],
    "zip_type": ["ZIP_TYPE", "TYPE"],
}


def parse_crosswalk(path: str | Path, source: str | None = None) -> list[dict]:
    path = Path(path)
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        upper = {h.strip().upper(): h for h in reader.fieldnames or []}
        cols = {}
        for key, names in _ALIASES.items():
            cols[key] = next((upper[n] for n in names if n in upper), None)
        if not cols["zip"] or not cols["zcta"]:
            raise ValueError(f"Crosswalk needs ZIP and ZCTA columns; found {reader.fieldnames}")
        out = []
        for row in reader:
            zip_, zcta = (row[cols["zip"]] or "").strip(), (row[cols["zcta"]] or "").strip()
            if not zip_.isdigit() or not zcta.isdigit():
                continue
            out.append({
                "zip": zip_.zfill(5),
                "zcta": zcta.zfill(5),
                "po_name": row[cols["po_name"]].strip() if cols["po_name"] else None,
                "state": row[cols["state"]].strip()[:2] if cols["state"] else None,
                "zip_type": row[cols["zip_type"]].strip() if cols["zip_type"] else None,
                "source": source or path.name,
            })
        return out

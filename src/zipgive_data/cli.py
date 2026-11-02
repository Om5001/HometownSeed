"""Command line entry point.

    zipgive migrate
    zipgive refresh [--year 2024] [--gazetteer-year 2024] [--skip-geo]
    zipgive load-crosswalk path/to/ZIPCodetoZCTACrosswalk.csv
    zipgive query 11234 11236 --min-age 2 --max-age 8
    zipgive suggest 11234
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from . import census, db, geo

DEFAULT_ACS_YEAR = 2024  # latest ACS 5-year (2020-2024); bump when Census releases the next


def _env(name: str, required: bool = True) -> str | None:
    val = os.environ.get(name)
    if required and not val:
        sys.exit(f"Missing environment variable {name} (see .env.example)")
    return val


def _load_dotenv() -> None:
    if os.path.exists(".env"):
        for line in open(".env"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def cmd_migrate(args) -> None:
    with db.connect(_env("DATABASE_URL")) as conn:
        print("applied:", ", ".join(db.migrate(conn)))


def cmd_refresh(args) -> None:
    key = _env("CENSUS_API_KEY", required=False)
    with db.connect(_env("DATABASE_URL")) as conn:
        db.migrate(conn)
        with db.run_log(conn, "acs_zcta_children", {"year": args.year}) as st:
            rows = census.fetch_zcta_children(args.year, key)
            st["rows"] = db.upsert(conn, "acs_zcta_children", rows, key=["zcta", "acs_year"],
                                   columns=census.COLUMNS)
            print(f"acs_zcta_children: {st['rows']} rows for ACS {args.year}")
        if not args.skip_geo:
            gy = args.gazetteer_year or args.year
            with db.run_log(conn, "zcta_geo", {"year": gy}) as st:
                rows = geo.fetch_gazetteer(gy)
                try:  # label each ZIP area with its nearest city/town name
                    labels = {r["zcta"]: r for r in geo.label_zctas(rows, geo.fetch_places(gy))}
                    for r in rows:
                        r.update({k: labels[r["zcta"]][k] for k in ("place_name", "place_state")})
                except Exception as exc:  # names are nice-to-have; never block the data load
                    print(f"warning: place names skipped ({exc})")
                    for r in rows:
                        r.setdefault("place_name", None); r.setdefault("place_state", None)
                st["rows"] = db.upsert(conn, "zcta_geo", rows, key=["zcta"])
                print(f"zcta_geo: {st['rows']} rows from {gy} Gazetteer (with place names)")
        conn.execute("refresh materialized view zcta_stats")  # app's fast per-ZIP table
        conn.commit()
        print("zcta_stats refreshed")


def cmd_load_crosswalk(args) -> None:
    rows = geo.parse_crosswalk(args.path, args.source)
    with db.connect(_env("DATABASE_URL")) as conn:
        db.migrate(conn)
        with db.run_log(conn, "zip_to_zcta", {"path": str(args.path)}) as st:
            st["rows"] = db.upsert(conn, "zip_to_zcta", rows, key=["zip"])
            print(f"zip_to_zcta: {st['rows']} rows")


def _print_rows(cur) -> None:
    cols = [d.name for d in cur.description]
    for row in cur.fetchall():
        print(json.dumps(dict(zip(cols, row)), default=str))


def cmd_query(args) -> None:
    with db.connect(_env("DATABASE_URL")) as conn, conn.cursor() as cur:
        cur.execute("select * from zip_child_estimates(%s, %s, %s)",
                    (args.zips, args.min_age, args.max_age))
        _print_rows(cur)
        print("--- area ---")
        cur.execute("select * from evaluate_area(%s, %s, %s, %s)",
                    (args.zips, args.min_age, args.max_age, args.income_threshold))
        _print_rows(cur)


def cmd_suggest(args) -> None:
    with db.connect(_env("DATABASE_URL")) as conn, conn.cursor() as cur:
        cur.execute("select * from suggest_area(%s, %s, %s)", (args.zip, args.min, args.radius))
        _print_rows(cur)


def main(argv: list[str] | None = None) -> None:
    _load_dotenv()
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="zipgive")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("migrate").set_defaults(fn=cmd_migrate)

    r = sub.add_parser("refresh", help="pull Census data into Postgres")
    r.add_argument("--year", type=int, default=int(os.environ.get("ACS_YEAR", DEFAULT_ACS_YEAR)))
    r.add_argument("--gazetteer-year", type=int)
    r.add_argument("--skip-geo", action="store_true")
    r.set_defaults(fn=cmd_refresh)

    c = sub.add_parser("load-crosswalk", help="load a ZIP->ZCTA crosswalk CSV")
    c.add_argument("path")
    c.add_argument("--source")
    c.set_defaults(fn=cmd_load_crosswalk)

    q = sub.add_parser("query", help="estimate children for a set of ZIPs")
    q.add_argument("zips", nargs="+")
    q.add_argument("--min-age", type=int, default=0)
    q.add_argument("--max-age", type=int, default=17)
    q.add_argument("--income-threshold", type=int, default=160000)
    q.set_defaults(fn=cmd_query)

    s = sub.add_parser("suggest", help="grow an area around a ZIP to reach 5,000")
    s.add_argument("zip")
    s.add_argument("--min", type=int, default=5000)
    s.add_argument("--radius", type=float, default=30)
    s.set_defaults(fn=cmd_suggest)

    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()

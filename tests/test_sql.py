"""Integration tests for the SQL query layer. Requires TEST_DATABASE_URL."""
import os

import pytest

from zipgive_data import census, db
from tests.fixtures.acs_sample import payload

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture()
def conn():
    c = db.connect(URL)
    c.execute("drop schema public cascade; create schema public;")
    c.commit()
    db.migrate(c)
    db.upsert(c, "acs_zcta_children", census.parse_response(payload(), 2024),
              key=["zcta", "acs_year"], columns=census.COLUMNS)
    db.upsert(c, "zcta_geo", [
        {"zcta": "11234", "lat": 40.6100, "lon": -73.9200, "land_sqmi": 5.8, "gazetteer_year": 2024},
        {"zcta": "11236", "lat": 40.6400, "lon": -73.9000, "land_sqmi": 4.0, "gazetteer_year": 2024},
        {"zcta": "00601", "lat": 18.18, "lon": -66.75, "land_sqmi": 64.0, "gazetteer_year": 2024},
    ], key=["zcta"])
    db.upsert(c, "zip_to_zcta", [
        {"zip": "11202", "zcta": "11234", "po_name": "Brooklyn", "state": "NY",
         "zip_type": "PO Box", "source": "test"}], key=["zip"])
    c.commit()
    yield c
    c.close()


def one(conn, q, params):
    cur = conn.execute(q, params)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def test_full_range_equals_total(conn):
    r = one(conn, "select * from zip_child_estimates(%s)", (["11234"],))[0]
    assert r["found"] and r["est_children"] == 9000


def test_age_split(conn):
    # ages 2-8: 1/3 of 0-2 (500) + 3-4 (1000) + 5 (500) + 6-8 (1500) + 7/18 of GQ (100) = 3539
    r = one(conn, "select * from zip_child_estimates(%s, 2, 8)", (["11234"],))[0]
    assert r["est_children"] == 3539
    # citizen share = 8500/9000
    assert r["est_eligible_children"] == round(3538.888 * 8500 / 9000)


def test_missing_and_crosswalk(conn):
    rows = {r["zip"]: r for r in one(conn, "select * from zip_child_estimates(%s)",
                                      (["11202", "99999"],))}
    assert rows["11202"]["zcta"] == "11234" and rows["11202"]["found"]
    assert not rows["99999"]["found"]


def test_evaluate_area_dedupes_and_tests(conn):
    r = one(conn, "select * from evaluate_area(%s)", (["11234", "11202", "11236", "99999"],))[0]
    assert r["zctas_matched"] == 2              # 11202 -> 11234 not double counted
    assert r["missing_zips"] == ["99999"]
    assert r["meets_min_beneficiaries"] is True
    assert r["all_below_income_threshold"] is False
    assert r["zctas_at_or_above_threshold"] == ["11236"]


def test_small_area_fails_minimum(conn):
    r = one(conn, "select * from evaluate_area(%s)", (["11236"],))[0]
    assert r["meets_min_beneficiaries"] is False


def test_nearby_and_suggest(conn):
    near = one(conn, "select * from nearby_zctas(%s, 10)", ("11234",))
    assert [n["zcta"] for n in near] == ["11234", "11236"]
    sug = one(conn, "select * from suggest_area(%s, 5000)", ("11234",))
    assert [s["zcta"] for s in sug] == ["11234"]      # already >= 5,000 alone
    sug = one(conn, "select * from suggest_area(%s, 10000)", ("11234",))
    assert [s["zcta"] for s in sug] == ["11234", "11236"]


def test_upsert_is_idempotent(conn):
    n1 = conn.execute("select count(*) from acs_zcta_children").fetchone()[0]
    db.upsert(conn, "acs_zcta_children", census.parse_response(payload(), 2024),
              key=["zcta", "acs_year"], columns=census.COLUMNS)
    conn.commit()
    assert conn.execute("select count(*) from acs_zcta_children").fetchone()[0] == n1

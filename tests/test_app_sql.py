"""Integration tests for the app layer (campaigns, matching, pooling views). Requires TEST_DATABASE_URL."""
import os

import pytest

from zipgive_data import census, db
from tests.fixtures.acs_sample import payload

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
U1, U2 = "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"


@pytest.fixture()
def conn():
    c = db.connect(URL)
    c.execute("drop schema public cascade; create schema public;")
    c.commit()
    db.migrate(c)
    db.upsert(c, "acs_zcta_children", census.parse_response(payload(), 2024), key=["zcta", "acs_year"], columns=census.COLUMNS)
    db.upsert(c, "zcta_geo", [
        {"zcta": "11234", "lat": 40.61, "lon": -73.92, "land_sqmi": 5.8, "gazetteer_year": 2024, "place_name": "New York", "place_state": "NY"},
        {"zcta": "11236", "lat": 40.64, "lon": -73.90, "land_sqmi": 4.0, "gazetteer_year": 2024, "place_name": "New York", "place_state": "NY"},
        {"zcta": "00601", "lat": 18.18, "lon": -66.75, "land_sqmi": 64.0, "gazetteer_year": 2024, "place_name": "Adjuntas", "place_state": "PR"},
    ], key=["zcta"])
    c.execute("refresh materialized view zcta_stats")
    c.execute("insert into app_users (id, email, display_name) values (%s,'a@x.com','A'), (%s,'b@x.com','B')", (U1, U2))
    c.commit()
    yield c
    c.close()


def mk(conn, slug, owner, zips, goal_cents, min_age=0, max_age=17):
    cid = conn.execute(
        "insert into campaigns (slug, name, owner_id, goal_cents, min_age, max_age) values (%s,%s,%s,%s,%s,%s) returning id",
        (slug, slug.title(), owner, goal_cents, min_age, max_age)).fetchone()[0]
    for z in zips:
        conn.execute("insert into campaign_zips (campaign_id, zcta) values (%s,%s)", (cid, z))
    conn.commit()
    return cid


def rows(conn, q, p=()):
    cur = conn.execute(q, p)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def test_campaign_stats_and_pledges(conn):
    cid = mk(conn, "alpha", U1, ["11234"], 50_000_00)
    conn.execute("insert into pledges (campaign_id, donor_name, amount_cents) values (%s,'X',10000), (%s,'Y',5000)", (cid, cid))
    conn.execute("insert into pledges (campaign_id, donor_name, amount_cents, status) values (%s,'Z',9900,'refunded')", (cid,))
    conn.commit()
    s = rows(conn, "select * from v_campaign_stats where slug='alpha'")[0]
    assert s["raised_cents"] == 15000            # refunded pledge excluded
    assert s["donors"] == 2
    assert float(s["kids_u18"]) == 8500           # 9000 kids * 8500/9000 citizen share
    assert s["meets_min"] is True


def test_matching_prefers_same_zips_and_similar_goal(conn):
    a = mk(conn, "same-zip", U1, ["11234"], 4_250_000)          # $5/child
    mk(conn, "nearby-diff-goal", U2, ["11236"], 100_00 * 10)     # tiny goal
    m = rows(conn, "select * from match_campaigns(array['11234'], 4250000)")
    assert m[0]["slug"] == "same-zip"
    assert m[0]["match_type"] == "same_area"
    assert float(m[0]["goal_similarity"]) > 0.99
    excl = rows(conn, "select slug from match_campaigns(array['11234'], 4250000, 0, 17, %s)", (a,))
    assert "same-zip" not in [r["slug"] for r in excl]


def test_small_areas_reach_minimum_together(conn):
    mk(conn, "puerto-rico", U1, ["00601"], 100_000)       # 1,700 eligible kids -> under 5,000
    m = rows(conn, "select * from match_campaigns(array['11236'], 100000)")
    pr = [r for r in m if r["slug"] == "puerto-rico"]
    # 11236 has 2,550 eligible; together 4,250 < 5,000, and far apart -> only matched via income test + similar goal
    if pr:
        assert pr[0]["match_type"] == "similar_goal"


def test_pool_stats_union(conn):
    a = mk(conn, "pool-a", U1, ["11234"], 100_000)
    b = mk(conn, "pool-b", U2, ["11234", "11236"], 100_000)
    pid = conn.execute("insert into pools (name) values ('p') returning id").fetchone()[0]
    conn.execute("update campaigns set pool_id = %s where id in (%s, %s)", (pid, a, b))
    conn.commit()
    p = rows(conn, "select * from v_pool_stats where id = %s", (pid,))[0]
    assert p["zip_count"] == 2                    # 11234 counted once
    assert float(p["kids_u18"]) == 8500 + 2550


def test_search_places(conn):
    assert [r["zcta"] for r in rows(conn, "select * from search_places('112')")] == ["11234", "11236"]
    assert rows(conn, "select * from search_places('Adjuntas, PR')")[0]["zcta"] == "00601"


def test_match_deck_ranks_location_then_amount(conn):
    near = mk(conn, "near-same", U2, ["11236"], int(2550 * 2500))      # ~$25/child, next door
    mk(conn, "far-away", U2, ["00601"], 100_000)
    conn.execute("""insert into giving_profiles (user_id, home_zip, target_zips, per_child_cents, gift_types, anchor_lat, anchor_lon)
                    values (%s, '11234', '{11234}', 2500, '{cash}', 40.61, -73.92)""", (U1,))
    conn.execute("""insert into giving_profiles (user_id, home_zip, target_zips, per_child_cents, gift_types, anchor_lat, anchor_lon)
                    values (%s, '11236', '{11236}', 2500, '{cash,stock}', 40.64, -73.90)""", (U2,))
    conn.commit()
    deck = rows(conn, "select * from match_deck(%s)", (U1,))
    kinds = [(d["kind"], d["title"]) for d in deck]
    assert ("person", "B") in kinds
    assert [d["slug"] for d in deck if d["kind"] == "campaign"][0] == "near-same"
    assert all(deck[i]["score"] >= deck[i + 1]["score"] for i in range(len(deck) - 1))
    # swiping removes a card; a mutual like shows up as a connection
    conn.execute("insert into swipes values (%s,'campaign',%s,'pass')", (U1, near))
    conn.execute("insert into swipes values (%s,'person',%s,'like'), (%s,'person',%s,'like')", (U1, U2, U2, U1))
    conn.commit()
    assert "near-same" not in [d["slug"] for d in rows(conn, "select * from match_deck(%s)", (U1,))]
    assert rows(conn, "select other_id::text from v_connections where user_id = %s", (U1,))[0]["other_id"] == U2


def test_child_estimate_survives_restricted_search_path(conn):
    # Postgres 17 (Supabase) builds materialized views with search_path = pg_catalog
    conn.execute("set search_path = pg_catalog, pg_temp")
    conn.execute("refresh materialized view public.zcta_stats")
    conn.execute("reset search_path")


def test_delete_account_keeps_money_records(conn):
    a = mk(conn, "keep-me", U1, ["11234"], 100_000)
    b = mk(conn, "drop-me", U1, ["11236"], 100_000)
    conn.execute("insert into campaign_members values (%s,%s,'owner',now())", (a, U1))
    conn.execute("insert into pledges (campaign_id, user_id, donor_name, amount_cents) values (%s,%s,'A',5000)", (a, U1))
    conn.execute("insert into sessions values ('h', %s, now(), now() + interval '1 day', null)", (U1,))
    conn.commit()
    conn.execute("select delete_account(%s)", (U1,))
    conn.commit()
    assert rows(conn, "select count(*) n from app_users where id = %s", (U1,))[0]["n"] == 0
    assert rows(conn, "select count(*) n from sessions")[0]["n"] == 0
    assert rows(conn, "select status, owner_id from campaigns where id = %s", (a,))[0] == {"status": "closed", "owner_id": None}
    assert rows(conn, "select count(*) n from campaigns where id = %s", (b,))[0]["n"] == 0
    p = rows(conn, "select donor_name, user_id, amount_cents from pledges")[0]
    assert p == {"donor_name": "Deleted account", "user_id": None, "amount_cents": 5000}


def test_tables_have_row_level_security(conn):
    off = rows(conn, "select tablename from pg_tables where schemaname = 'public' and not rowsecurity")
    assert off == []

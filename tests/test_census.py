import httpx
import pytest

from zipgive_data import census
from tests.fixtures.acs_sample import payload


def test_parse_sums_and_types():
    recs = {r["zcta"]: r for r in census.parse_response(payload(), 2024)}
    r = recs["11234"]
    assert r["acs_year"] == 2024
    assert r["total_u18"] == 9000
    assert r["age_6_8"] == 1500
    assert r["citizen_u18"] == 4200 + 100 + 4100 + 100
    assert r["noncitizen_u18"] == 400
    assert r["median_hh_income"] == 85000


def test_negative_sentinel_becomes_null():
    recs = {r["zcta"]: r for r in census.parse_response(payload(), 2024)}
    assert recs["00601"]["median_hh_income"] is None


def test_variable_count_under_api_limit():
    assert len(census.all_census_vars()) <= 49  # API max is 50 incl. geography


def test_fetch_builds_request_and_parses():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        return httpx.Response(200, json=payload())

    client = httpx.Client(transport=httpx.MockTransport(handler))
    rows = census.fetch_zcta_children(2024, api_key="k", client=client)
    assert len(rows) == 3
    assert "acs/acs5" in seen["url"] and "zip+code+tabulation+area" in seen["url"]
    assert "key=k" in seen["url"]


def test_fetch_raises_on_html_error():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, text="<html>Invalid Key</html>")))
    with pytest.raises(RuntimeError, match="CENSUS_API_KEY"):
        census.fetch_zcta_children(2024, client=client)

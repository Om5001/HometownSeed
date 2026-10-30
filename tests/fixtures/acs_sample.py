"""Hand-built Census API responses in the real [header, *rows] format."""
from zipgive_data.census import all_census_vars, GEO_ZCTA

HEADER = [*all_census_vars(), GEO_ZCTA]

# Values per variable for three fake-but-shaped ZCTAs.
_BASE = {
    "B09001_001E": 9000, "B09001_001M": 400,
    "B09001_003E": 1500, "B09001_004E": 1000, "B09001_005E": 500, "B09001_006E": 1500,
    "B09001_007E": 1500, "B09001_008E": 1500, "B09001_009E": 1400, "B09001_010E": 100,
    "B05003_004E": 4200, "B05003_006E": 100, "B05003_007E": 200,
    "B05003_015E": 4100, "B05003_017E": 100, "B05003_018E": 200,
    "B19013_001E": 85000,
}


def row(zcta, scale=1.0, income=None, overrides=None):
    vals = {k: int(v * scale) for k, v in _BASE.items()}
    if income is not None:
        vals["B19013_001E"] = income
    vals.update(overrides or {})
    return [str(vals[v]) for v in all_census_vars()] + [zcta]


def payload():
    return [
        HEADER,
        row("11234"),                         # ~9,000 under 18
        row("11236", scale=0.3, income=170000),
        row("00601", scale=0.2, overrides={"B19013_001E": -666666666}),  # sentinel
    ]

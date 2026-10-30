from zipgive_data import geo

GAZ = (
    "GEOID\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG                 \n"
    "11234\t15000000\t2000000\t5.79\t0.77\t40.6100\t-73.9200\n"
    "00601\t166000000\t800000\t64.1\t0.3\t18.1806\t-66.7499\n"
)


def test_parse_gazetteer_handles_padded_header():
    rows = geo.parse_gazetteer(GAZ, 2024)
    assert rows[0] == {"zcta": "11234", "lat": 40.61, "lon": -73.92,
                       "land_sqmi": 5.79, "gazetteer_year": 2024}
    assert rows[1]["zcta"] == "00601"


def test_parse_crosswalk_uds_format(tmp_path):
    p = tmp_path / "xw.csv"
    p.write_text("ZIP_CODE,PO_NAME,STATE,ZIP_TYPE,ZCTA,zip_join_type\n"
                 "11234,Brooklyn,NY,Zip Code Area,11234,Zip matches ZCTA\n"
                 "11202,Brooklyn,NY,Post Office or large volume customer,11201,Spatial join\n"
                 "601,Adjuntas,PR,Zip Code Area,601,Zip matches ZCTA\n")
    rows = {r["zip"]: r for r in geo.parse_crosswalk(p)}
    assert rows["11202"]["zcta"] == "11201"
    assert rows["00601"]["zcta"] == "00601"
    assert rows["11234"]["state"] == "NY"

-- Tiny fixture for CI smoke tests (shaped like real ACS rows; not real numbers).
insert into acs_zcta_children (zcta, acs_year, age_0_2, age_3_4, age_5, age_6_8, age_9_11, age_12_14, age_15_17,
  group_quarters_u18, total_u18, total_u18_moe, citizen_u18, noncitizen_u18, median_hh_income) values
 ('11234',2024,2534,1690,942,2825,3219,3415,2930,0,17555,1424,16853,702,97479),
 ('11236',2024,2600,1700,900,2900,3300,3200,3400,0,18000,1500,17280,720,88000),
 ('11210',2024,1800,1200,600,2000,2200,2300,2400,0,12500,1100,12000,500,84000),
 ('93706',2024,2000,1300,700,2300,2600,2700,2000,0,13600,1200,13017,583,32000),
 ('59001',2024,30,20,10,40,40,45,50,0,235,60,235,0,61000)
on conflict do nothing;
insert into zcta_geo (zcta, lat, lon, land_sqmi, gazetteer_year, place_name, place_state) values
 ('11234',40.608,-73.911,7.4,2024,'New York','NY'), ('11236',40.639,-73.901,3.5,2024,'New York','NY'),
 ('11210',40.628,-73.946,1.8,2024,'New York','NY'), ('93706',36.66,-119.9,95,2024,'Fresno','CA'),
 ('59001',45.53,-109.47,300,2024,'Absarokee','MT')
on conflict do nothing;
refresh materialized view zcta_stats;
-- one 501(c)(3) in the IRS exempt-organization table (fake EIN) for nonprofit tests
insert into irs_exempt_orgs (ein, name, street, city, state, zip, subsection, deductibility, ruling, foundation, ntee_cd, revenue_amt)
values ('000000123', 'TEST COMMUNITY FOUNDATION', '1 MAIN ST', 'BROOKLYN', 'NY', '11234', '03', '1', '200001', '15', 'T31', 500000),
       ('000000456', 'TEST SOCIAL CLUB', '2 MAIN ST', 'BROOKLYN', 'NY', '11234', '07', '2', '199001', '00', 'N50', 1000)
on conflict do nothing;

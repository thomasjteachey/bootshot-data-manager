DELIMITER ;;
CREATE DEFINER=`brokilodeluxe`@`%` PROCEDURE `merge_households_from_pantry`()
BEGIN
  DECLARE v_rows INT DEFAULT 1;

  /* ====================================================
     0) Normalize existing people for matching
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_person_norm;
  CREATE TEMPORARY TABLE tmp_person_norm (
    person_id BIGINT UNSIGNED NOT NULL,
    fn_up     VARCHAR(100) NOT NULL,
    ln_up     VARCHAR(100) NOT NULL,
    dob       DATE NULL,
    KEY ix_pnorm_name_dob (ln_up, fn_up, dob)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_person_norm (person_id, fn_up, ln_up, dob)
  SELECT
    p.person_id,
    CAST(UPPER(TRIM(p.first_name)) AS CHAR(100)) AS fn_up,
    CAST(UPPER(TRIM(p.last_name))  AS CHAR(100)) AS ln_up,
    p.dob
  FROM person p;

  /* ====================================================
     1) One row per pantry client (dedup)
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_pantry_by_client;
  CREATE TEMPORARY TABLE tmp_pantry_by_client (
    client_id              BIGINT UNSIGNED NOT NULL,
    client_first_name      VARCHAR(100) NULL,
    client_last_name       VARCHAR(100) NULL,
    client_fn_up           VARCHAR(100) NOT NULL,
    client_ln_up           VARCHAR(100) NOT NULL,
    client_dob             DATE NULL,
    client_gender_identity VARCHAR(500) NULL,
    client_ethnicity       VARCHAR(500) NULL,
    client_employment      VARCHAR(500) NULL,
    education_level        VARCHAR(255) NULL,
    housing_type           VARCHAR(255) NULL,
    household_size_txt     VARCHAR(50)  NULL,
    monthly_income_txt     VARCHAR(50)  NULL,
    address1               VARCHAR(255) NULL,
    address2               VARCHAR(255) NULL,
    city                   VARCHAR(100) NULL,
    state                  CHAR(2)      NULL,
    zip                    VARCHAR(10)  NULL,
    pantry_household_id    VARCHAR(100) NULL,
    PRIMARY KEY (client_id),
    KEY ix_pantry_name_dob (client_ln_up, client_fn_up, client_dob),
    KEY ix_pantry_hhid (pantry_household_id)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_pantry_by_client (
    client_id, client_first_name, client_last_name,
    client_fn_up, client_ln_up, client_dob,
    client_gender_identity, client_ethnicity, client_employment,
    education_level, housing_type, household_size_txt, monthly_income_txt,
    address1, address2, city, state, zip, pantry_household_id
  )
  SELECT
    x.client_id,
    MAX(x.client_first_name),
    MAX(x.client_last_name),
    CAST(UPPER(TRIM(MAX(x.client_first_name))) AS CHAR(100)) AS client_fn_up,
    CAST(UPPER(TRIM(MAX(x.client_last_name)))  AS CHAR(100)) AS client_ln_up,
    COALESCE(
      STR_TO_DATE(COALESCE(MAX(x.client_dob_txt), MAX(x.client_dob_est_txt)), '%Y-%m-%d'),
      STR_TO_DATE(COALESCE(MAX(x.client_dob_txt), MAX(x.client_dob_est_txt)), '%m/%d/%Y'),
      STR_TO_DATE(COALESCE(MAX(x.client_dob_txt), MAX(x.client_dob_est_txt)), '%m-%d-%Y'),
      STR_TO_DATE(COALESCE(MAX(x.client_dob_txt), MAX(x.client_dob_est_txt)), '%Y/%m/%d')
    ) AS client_dob,
    MAX(x.client_gender_identity),
    MAX(x.client_ethnicity),
    MAX(x.client_employment),
    MAX(x.education_level),
    MAX(x.housing_type),
    MAX(x.household_size_txt),
    MAX(x.monthly_income_txt),
    MAX(x.address1),
    MAX(x.address2),
    MAX(x.city),
    MAX(x.state),
    MAX(x.zip),
    MAX(x.pantry_household_id)
  FROM (
    SELECT
      CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED) AS client_id,
      LEFT(NULLIF(TRIM(`Client First Name`), ''), 100) AS client_first_name,
      LEFT(NULLIF(TRIM(`Client Last Name`),  ''), 100) AS client_last_name,
      LEFT(NULLIF(TRIM(`Client Date of Birth`), ''), 50) AS client_dob_txt,
      LEFT(NULLIF(TRIM(`Client Estimated Date of Birth`), ''), 50) AS client_dob_est_txt,
      LEFT(NULLIF(TRIM(`Client Gender Identity-Labels`), ''), 500) AS client_gender_identity,
      LEFT(NULLIF(TRIM(`Client Ethnicity-Labels`), ''), 500) AS client_ethnicity,
      LEFT(NULLIF(TRIM(`Client Employment`), ''), 500) AS client_employment,
      LEFT(NULLIF(TRIM(`Highest Education Level`), ''), 255) AS education_level,
      LEFT(NULLIF(TRIM(`Housing Type`), ''), 255) AS housing_type,
      LEFT(NULLIF(TRIM(`Household Size`), ''), 50) AS household_size_txt,
      LEFT(NULLIF(TRIM(`Monthly Household Income`), ''), 50) AS monthly_income_txt,
      LEFT(NULLIF(TRIM(`Street`), ''), 255) AS address1,
      LEFT(NULLIF(TRIM(`Line 2`), ''), 255) AS address2,
      LEFT(NULLIF(TRIM(`City`), ''), 100) AS city,
      LEFT(NULLIF(TRIM(`State`), ''), 2) AS state,
      LEFT(NULLIF(TRIM(`Zip Code`), ''), 10) AS zip,
      LEFT(NULLIF(TRIM(`Household ID`), ''), 100) AS pantry_household_id
    FROM pantry_export
  ) x
  WHERE x.client_id IS NOT NULL AND x.client_id <> 0
  GROUP BY x.client_id;

  /* ====================================================
     2) Link/insert pantry clients into person
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_client_to_person;
  CREATE TEMPORARY TABLE tmp_client_to_person (
    client_id BIGINT UNSIGNED NOT NULL,
    person_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (client_id),
    KEY ix_ctp_person (person_id)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_client_to_person (client_id, person_id)
  SELECT
    t.client_id,
    MIN(pn.person_id) AS person_id
  FROM tmp_pantry_by_client t
  JOIN tmp_person_norm pn
    ON pn.dob   = t.client_dob
   AND pn.fn_up = t.client_fn_up
   AND pn.ln_up = t.client_ln_up
  GROUP BY t.client_id;

  UPDATE person p
  JOIN tmp_client_to_person m ON m.person_id = p.person_id
  JOIN tmp_pantry_by_client t ON t.client_id = m.client_id
  SET
    p.pantry_client_id  = COALESCE(p.pantry_client_id, t.client_id),
    p.gender_identity   = COALESCE(p.gender_identity, LEFT(t.client_gender_identity, 255)),
    p.ethnicity         = COALESCE(p.ethnicity, LEFT(t.client_ethnicity, 255)),
    p.employment_status = COALESCE(p.employment_status, LEFT(t.client_employment, 255)),
    p.education_level   = COALESCE(p.education_level, LEFT(t.education_level, 100)),
    p.housing_type      = COALESCE(p.housing_type, LEFT(t.housing_type, 100)),
    p.address1          = COALESCE(p.address1, LEFT(t.address1, 255)),
    p.address2          = COALESCE(p.address2, LEFT(t.address2, 255)),
    p.city              = COALESCE(p.city, LEFT(t.city, 100)),
    p.state             = COALESCE(p.state, LEFT(t.state, 2)),
    p.zip               = COALESCE(p.zip, LEFT(t.zip, 10)),
    p.household_size    = COALESCE(
                           p.household_size,
                           CASE WHEN t.household_size_txt REGEXP '^[0-9]+$' THEN CAST(t.household_size_txt AS UNSIGNED) ELSE NULL END
                         ),
    p.monthly_income    = COALESCE(
                           p.monthly_income,
                           CASE
                             WHEN REPLACE(REPLACE(t.monthly_income_txt,'$',''),',','') REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
                               THEN CAST(REPLACE(REPLACE(t.monthly_income_txt,'$',''),',','') AS DECIMAL(13,2))
                             ELSE NULL
                           END
                         )
  WHERE p.pantry_client_id IS NULL;

  INSERT INTO person (
    last_name, first_name, dob, pantry_client_id,
    gender_identity, ethnicity, employment_status,
    education_level, housing_type, household_size, monthly_income,
    address1, address2, city, state, zip
  )
  SELECT
    TRIM(t.client_last_name),
    TRIM(t.client_first_name),
    t.client_dob,
    t.client_id,
    LEFT(t.client_gender_identity, 255),
    LEFT(t.client_ethnicity, 255),
    LEFT(t.client_employment, 255),
    LEFT(t.education_level, 100),
    LEFT(t.housing_type, 100),
    CASE WHEN t.household_size_txt REGEXP '^[0-9]+$' THEN CAST(t.household_size_txt AS UNSIGNED) ELSE NULL END,
    CASE
      WHEN REPLACE(REPLACE(t.monthly_income_txt,'$',''),',','') REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
        THEN CAST(REPLACE(REPLACE(t.monthly_income_txt,'$',''),',','') AS DECIMAL(13,2))
      ELSE NULL
    END,
    LEFT(t.address1, 255),
    LEFT(t.address2, 255),
    LEFT(t.city, 100),
    LEFT(t.state, 2),
    LEFT(t.zip, 10)
  FROM tmp_pantry_by_client t
  ON DUPLICATE KEY UPDATE
    gender_identity   = COALESCE(person.gender_identity, VALUES(gender_identity)),
    ethnicity         = COALESCE(person.ethnicity, VALUES(ethnicity)),
    employment_status = COALESCE(person.employment_status, VALUES(employment_status)),
    education_level   = COALESCE(person.education_level, VALUES(education_level)),
    housing_type      = COALESCE(person.housing_type, VALUES(housing_type)),
    address1          = COALESCE(person.address1, VALUES(address1)),
    address2          = COALESCE(person.address2, VALUES(address2)),
    city              = COALESCE(person.city, VALUES(city)),
    state             = COALESCE(person.state, VALUES(state)),
    zip               = COALESCE(person.zip, VALUES(zip)),
    household_size    = COALESCE(person.household_size, VALUES(household_size)),
    monthly_income    = COALESCE(person.monthly_income, VALUES(monthly_income));

  /* ====================================================
     3) client_id -> household_id (head = that client's person_id)
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_household_id_for_client;
  CREATE TEMPORARY TABLE tmp_household_id_for_client (
    client_id           BIGINT UNSIGNED NOT NULL,
    household_id        BIGINT UNSIGNED NOT NULL,
    pantry_household_id VARCHAR(100) NULL,
    PRIMARY KEY (client_id),
    KEY ix_hh_pantry (pantry_household_id),
    KEY ix_hh_client (client_id, household_id)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_household_id_for_client (client_id, household_id, pantry_household_id)
  SELECT
    t.client_id,
    p.person_id,
    t.pantry_household_id
  FROM tmp_pantry_by_client t
  JOIN person p ON p.pantry_client_id = t.client_id;

  /* Merge by Impact Household ID if present */
  DROP TEMPORARY TABLE IF EXISTS tmp_hh_by_pantry_household;
  CREATE TEMPORARY TABLE tmp_hh_by_pantry_household AS
  SELECT pantry_household_id, MIN(household_id) AS merged_household_id
  FROM tmp_household_id_for_client
  WHERE pantry_household_id IS NOT NULL AND pantry_household_id <> ''
  GROUP BY pantry_household_id;

  UPDATE tmp_household_id_for_client h
  JOIN tmp_hh_by_pantry_household g
    ON g.pantry_household_id = h.pantry_household_id
  SET h.household_id = g.merged_household_id
  WHERE h.household_id <> g.merged_household_id;

  /* ====================================================
     4) Unpivot HH members 1..9 directly from pantry_export
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_household_members;
  CREATE TEMPORARY TABLE tmp_household_members (
    owner_client_id BIGINT UNSIGNED NOT NULL,
    first_name_raw  VARCHAR(100) NULL,
    last_name_raw   VARCHAR(100) NULL,
    first_name_up   VARCHAR(100) NULL,
    last_name_up    VARCHAR(100) NULL,
    dob             DATE NULL,
    gender_identity VARCHAR(500) NULL,
    ethnicity       VARCHAR(500) NULL,
    employment      VARCHAR(500) NULL,
    KEY ix_hhm_owner (owner_client_id),
    KEY ix_hhm_name_dob (last_name_up, first_name_up, dob)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_household_members
    (owner_client_id, first_name_raw, last_name_raw, first_name_up, last_name_up, dob, gender_identity, ethnicity, employment)
  SELECT
    owner_client_id,
    first_name_raw,
    last_name_raw,
    CAST(UPPER(TRIM(first_name_raw)) AS CHAR(100)),
    CAST(UPPER(TRIM(last_name_raw))  AS CHAR(100)),
    dob,
    gender_identity,
    ethnicity,
    employment
  FROM (
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED) AS owner_client_id,
           LEFT(NULLIF(TRIM(`HH Mem 1- First Name`), ''), 100) AS first_name_raw,
           LEFT(NULLIF(TRIM(`HH Mem 1- Last Name`),  ''), 100) AS last_name_raw,
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 1- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 1- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 1- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 1- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 1- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 1- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 1- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 1- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ) AS dob,
           LEFT(NULLIF(TRIM(`HH Mem 1- Gender Identity-Labels`), ''), 500) AS gender_identity,
           LEFT(NULLIF(TRIM(`HH Mem 1- Ethnicity-Labels`), ''), 500) AS ethnicity,
           LEFT(NULLIF(TRIM(`HH Mem 1- Employment`), ''), 500) AS employment
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 2- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 2- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 2- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 2- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 2- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 2- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 2- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 2- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 2- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 2- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 2- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 2- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 2- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 3- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 3- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 3- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 3- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 3- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 3- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 3- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 3- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 3- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 3- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 3- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 3- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 3- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 4- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 4- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 4- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 4- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 4- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 4- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 4- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 4- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 4- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 4- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 4- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 4- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 4- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 5- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 5- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 5- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 5- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 5- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 5- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 5- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 5- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 5- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 5- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 5- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 5- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 5- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 6- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 6- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 6- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 6- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 6- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 6- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 6- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 6- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 6- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 6- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 6- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 6- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 6- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 7- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 7- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 7- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 7- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 7- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 7- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 7- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 7- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 7- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 7- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 7- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 7- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 7- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 8- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 8- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 8- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 8- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 8- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 8- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 8- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 8- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 8- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 8- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 8- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 8- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 8- Employment`), ''), 500)
    FROM pantry_export

    UNION ALL
    SELECT CAST(NULLIF(TRIM(`Client ID`), '') AS UNSIGNED),
           LEFT(NULLIF(TRIM(`HH Mem 9- First Name`), ''), 100),
           LEFT(NULLIF(TRIM(`HH Mem 9- Last Name`),  ''), 100),
           COALESCE(
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 9- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 9- Estimated Date of Birth`), '')), '%Y-%m-%d'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 9- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 9- Estimated Date of Birth`), '')), '%m/%d/%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 9- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 9- Estimated Date of Birth`), '')), '%m-%d-%Y'),
             STR_TO_DATE(COALESCE(NULLIF(TRIM(`HH Mem 9- Date of Birth`), ''), NULLIF(TRIM(`HH Mem 9- Estimated Date of Birth`), '')), '%Y/%m/%d')
           ),
           LEFT(NULLIF(TRIM(`HH Mem 9- Gender Identity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 9- Ethnicity-Labels`), ''), 500),
           LEFT(NULLIF(TRIM(`HH Mem 9- Employment`), ''), 500)
    FROM pantry_export
  ) u
  WHERE u.owner_client_id IS NOT NULL AND u.owner_client_id <> 0;

  DELETE FROM tmp_household_members
  WHERE first_name_raw IS NULL OR last_name_raw IS NULL OR dob IS NULL;

  /* ====================================================
     5) Member is also a pantry client => merge households
        FIXED: no UNION over temp table (avoids 1137)
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_client_links;
  CREATE TEMPORARY TABLE tmp_client_links (
    owner_client_id  BIGINT UNSIGNED NOT NULL,
    member_client_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (owner_client_id, member_client_id),
    KEY ix_links_member (member_client_id)
  ) ENGINE=InnoDB;

  INSERT IGNORE INTO tmp_client_links (owner_client_id, member_client_id)
  SELECT DISTINCT
    m.owner_client_id,
    c.client_id
  FROM tmp_household_members m
  JOIN tmp_pantry_by_client c
    ON c.client_fn_up = m.first_name_up
   AND c.client_ln_up = m.last_name_up
   AND c.client_dob   = m.dob
  WHERE c.client_id <> m.owner_client_id;

  /* make a second copy so we never “reopen” the same temp table in one statement */
  DROP TEMPORARY TABLE IF EXISTS tmp_client_links2;
  CREATE TEMPORARY TABLE tmp_client_links2 AS
  SELECT owner_client_id, member_client_id FROM tmp_client_links;
  ALTER TABLE tmp_client_links2
    ADD PRIMARY KEY (owner_client_id, member_client_id),
    ADD KEY ix_links2_member (member_client_id);

  SET v_rows = 1;
  WHILE v_rows > 0 DO
    DROP TEMPORARY TABLE IF EXISTS tmp_household_id_for_client2;
    CREATE TEMPORARY TABLE tmp_household_id_for_client2 AS
    SELECT client_id, household_id FROM tmp_household_id_for_client;
    ALTER TABLE tmp_household_id_for_client2
      ADD PRIMARY KEY (client_id),
      ADD KEY ix_hh2 (client_id, household_id);

    DROP TEMPORARY TABLE IF EXISTS tmp_hh_merge_pairs;
    CREATE TEMPORARY TABLE tmp_hh_merge_pairs (
      client_id BIGINT UNSIGNED NOT NULL,
      merged_household_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (client_id, merged_household_id)
    ) ENGINE=InnoDB;

    /* owner side */
    INSERT IGNORE INTO tmp_hh_merge_pairs (client_id, merged_household_id)
    SELECT
      l.owner_client_id,
      LEAST(h1.household_id, h2.household_id)
    FROM tmp_client_links l
    JOIN tmp_household_id_for_client  h1 ON h1.client_id = l.owner_client_id
    JOIN tmp_household_id_for_client2 h2 ON h2.client_id = l.member_client_id;

    /* member side (using the copy table so no reopen) */
    INSERT IGNORE INTO tmp_hh_merge_pairs (client_id, merged_household_id)
    SELECT
      l2.member_client_id,
      LEAST(h1.household_id, h2.household_id)
    FROM tmp_client_links2 l2
    JOIN tmp_household_id_for_client  h1 ON h1.client_id = l2.owner_client_id
    JOIN tmp_household_id_for_client2 h2 ON h2.client_id = l2.member_client_id;

    DROP TEMPORARY TABLE IF EXISTS tmp_hh_merge_flat;
    CREATE TEMPORARY TABLE tmp_hh_merge_flat AS
    SELECT client_id, MIN(merged_household_id) AS merged_household_id
    FROM tmp_hh_merge_pairs
    GROUP BY client_id;

    ALTER TABLE tmp_hh_merge_flat
      ADD PRIMARY KEY (client_id);

    UPDATE tmp_household_id_for_client h
    JOIN tmp_hh_merge_flat f ON f.client_id = h.client_id
    SET h.household_id = f.merged_household_id
    WHERE h.household_id > f.merged_household_id;

    SET v_rows = ROW_COUNT();
  END WHILE;

  /* ====================================================
     6) Insert missing member persons (name+dob)
     ==================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_person_norm;
  CREATE TEMPORARY TABLE tmp_person_norm (
    person_id BIGINT UNSIGNED NOT NULL,
    fn_up     VARCHAR(100) NOT NULL,
    ln_up     VARCHAR(100) NOT NULL,
    dob       DATE NULL,
    KEY ix_pnorm_name_dob (ln_up, fn_up, dob)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_person_norm (person_id, fn_up, ln_up, dob)
  SELECT
    p.person_id,
    CAST(UPPER(TRIM(p.first_name)) AS CHAR(100)),
    CAST(UPPER(TRIM(p.last_name))  AS CHAR(100)),
    p.dob
  FROM person p;

  INSERT IGNORE INTO person (last_name, first_name, dob, gender_identity, ethnicity, employment_status)
  SELECT
    LEFT(TRIM(m.last_name_raw), 100),
    LEFT(TRIM(m.first_name_raw), 100),
    m.dob,
    LEFT(m.gender_identity, 255),
    LEFT(m.ethnicity, 255),
    LEFT(m.employment, 255)
  FROM tmp_household_members m
  LEFT JOIN tmp_person_norm pn
    ON pn.dob   = m.dob
   AND pn.fn_up = m.first_name_up
   AND pn.ln_up = m.last_name_up
  WHERE pn.person_id IS NULL;

  /* refresh norm */
  DROP TEMPORARY TABLE IF EXISTS tmp_person_norm;
  CREATE TEMPORARY TABLE tmp_person_norm (
    person_id BIGINT UNSIGNED NOT NULL,
    fn_up     VARCHAR(100) NOT NULL,
    ln_up     VARCHAR(100) NOT NULL,
    dob       DATE NULL,
    KEY ix_pnorm_name_dob (ln_up, fn_up, dob)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_person_norm (person_id, fn_up, ln_up, dob)
  SELECT
    p.person_id,
    CAST(UPPER(TRIM(p.first_name)) AS CHAR(100)),
    CAST(UPPER(TRIM(p.last_name))  AS CHAR(100)),
    p.dob
  FROM person p;

  /* ====================================================
     7) Write household links
     ==================================================== */
  INSERT IGNORE INTO household (household_id, person_id)
  SELECT DISTINCT household_id, household_id
  FROM tmp_household_id_for_client;

  INSERT IGNORE INTO household (household_id, person_id)
  SELECT DISTINCT
    h.household_id,
    pn.person_id
  FROM tmp_household_members m
  JOIN tmp_household_id_for_client h
    ON h.client_id = m.owner_client_id
  JOIN tmp_person_norm pn
    ON pn.dob   = m.dob
   AND pn.fn_up = m.first_name_up
   AND pn.ln_up = m.last_name_up;

END ;;
DELIMITER ;

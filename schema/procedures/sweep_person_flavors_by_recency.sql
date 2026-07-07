DELIMITER ;;
CREATE DEFINER=`brokilodeluxe`@`%` PROCEDURE `sweep_person_flavors_by_recency`()
BEGIN
  /* =====================================================
     1) PANTRY (highest) – per Client ID, no date logic
     ===================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_pantry_last;
  CREATE TEMPORARY TABLE tmp_pantry_last (
    client_id        BIGINT UNSIGNED NOT NULL,
    city             VARCHAR(100) NULL,
    housing_type     VARCHAR(100) NULL,
    household_size   TINYINT UNSIGNED NULL,
    monthly_income   DECIMAL(13,2) NULL,
    primary_language VARCHAR(50) NULL,
    education_level  VARCHAR(100) NULL,
    PRIMARY KEY (client_id)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_pantry_last (client_id, city, housing_type, household_size, monthly_income, primary_language, education_level)
  SELECT
    CAST(NULLIF(TRIM(pe.`Client ID`), '') AS UNSIGNED) AS client_id,
    MAX(NULLIF(TRIM(pe.`City`), '')) AS city,
    MAX(NULLIF(TRIM(pe.`Housing Type`), '')) AS housing_type,
    MAX(
      CASE
        WHEN NULLIF(TRIM(pe.`Household Size`), '') REGEXP '^[0-9]+$'
          THEN CAST(TRIM(pe.`Household Size`) AS UNSIGNED)
        ELSE NULL
      END
    ) AS household_size,
    MAX(
      CASE
        WHEN NULLIF(TRIM(pe.`Monthly Household Income`), '') IS NULL THEN NULL
        WHEN REPLACE(REPLACE(TRIM(pe.`Monthly Household Income`), '$', ''), ',', '') REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
          THEN CAST(REPLACE(REPLACE(TRIM(pe.`Monthly Household Income`), '$', ''), ',', '') AS DECIMAL(13,2))
        ELSE NULL
      END
    ) AS monthly_income,
    MAX(
      NULLIF(
        TRIM(SUBSTRING_INDEX(NULLIF(TRIM(pe.`Household Languages`), ''), ',', 1)),
        ''
      )
    ) AS primary_language,
    MAX(NULLIF(TRIM(pe.`Highest Education Level`), '')) AS education_level
  FROM pantry_export pe
  WHERE NULLIF(TRIM(pe.`Client ID`), '') IS NOT NULL
  GROUP BY CAST(NULLIF(TRIM(pe.`Client ID`), '') AS UNSIGNED);

  UPDATE person p
  JOIN tmp_pantry_last pl
    ON pl.client_id = p.pantry_client_id
  SET
    p.city             = COALESCE(pl.city, p.city),
    p.housing_type     = COALESCE(pl.housing_type, p.housing_type),
    p.household_size   = COALESCE(pl.household_size, p.household_size),
    p.monthly_income   = COALESCE(pl.monthly_income, p.monthly_income),
    p.primary_language = COALESCE(pl.primary_language, p.primary_language),
    p.education_level  = COALESCE(p.education_level, pl.education_level);

  /* =====================================================
     2) PHARMACY (middle) – choose latest event per PAT KEY
        SAFE date parsing (no 1411)
     ===================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_pharm_events;
  CREATE TEMPORARY TABLE tmp_pharm_events (
    pat_key     BIGINT UNSIGNED NOT NULL,
    event_date  DATE NULL,
    email       VARCHAR(254) NULL,
    area        VARCHAR(10)  NULL,
    xchg        VARCHAR(10)  NULL,
    nbr         VARCHAR(10)  NULL,
    address1    VARCHAR(255) NULL,
    address2    VARCHAR(255) NULL,
    city        VARCHAR(100) NULL,
    state       CHAR(2)      NULL,
    zip         VARCHAR(10)  NULL,
    KEY ix_evt (pat_key, event_date)
  ) ENGINE=InnoDB;

  /* pickup-date export: prefer RX PICKED UP, fallback RX DATE */
  INSERT INTO tmp_pharm_events (pat_key, event_date, email, area, xchg, nbr, address1, address2, city, state, zip)
  SELECT
    CAST(NULLIF(TRIM(ph.`PAT KEY`), '') AS UNSIGNED) AS pat_key,

    /* SAFE parse */
    CASE
      /* prefer RX PICKED UP */
      WHEN NULLIF(TRIM(ph.`RX PICKED UP`), '') IS NOT NULL THEN
        CASE
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1), '%Y-%m-%d')
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1), '%m/%d/%Y')
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1), '%m-%d-%Y')
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1) REGEXP '^[0-9]{4}/[0-9]{1,2}/[0-9]{1,2}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX PICKED UP`), ' ', 1), '%Y/%m/%d')
          ELSE NULL
        END

      /* else fallback RX DATE */
      WHEN NULLIF(TRIM(ph.`RX DATE`), '') IS NOT NULL THEN
        CASE
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1), '%Y-%m-%d')
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1), '%m/%d/%Y')
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1), '%m-%d-%Y')
          WHEN SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1) REGEXP '^[0-9]{4}/[0-9]{1,2}/[0-9]{1,2}$'
            THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`RX DATE`), ' ', 1), '%Y/%m/%d')
          ELSE NULL
        END
      ELSE NULL
    END AS event_date,

    NULLIF(TRIM(ph.`EMAIL`), ''),
    NULLIF(TRIM(ph.`AREA`), ''),
    NULLIF(TRIM(ph.`XCHG`), ''),
    NULLIF(TRIM(ph.`NBR`), ''),
    NULLIF(TRIM(ph.`ADDRESS1`), ''),
    NULLIF(TRIM(ph.`ADDRESS2`), ''),
    NULLIF(TRIM(ph.`CITY`), ''),
    NULLIF(TRIM(ph.`STATE`), ''),
    NULLIF(TRIM(ph.`ZIP`), '')
  FROM pharmacy_pickup_date_export ph
  WHERE NULLIF(TRIM(ph.`PAT KEY`), '') IS NOT NULL;

  /* insurance export: LAST RXDATE */
  INSERT INTO tmp_pharm_events (pat_key, event_date, email, area, xchg, nbr, address1, address2, city, state, zip)
  SELECT
    CAST(NULLIF(TRIM(ph.`PAT KEY`), '') AS UNSIGNED) AS pat_key,
    CASE
      WHEN NULLIF(TRIM(ph.`LAST RXDATE`), '') IS NULL THEN NULL
      WHEN SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1), '%Y-%m-%d')
      WHEN SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1), '%m/%d/%Y')
      WHEN SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1), '%m-%d-%Y')
      WHEN SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1) REGEXP '^[0-9]{4}/[0-9]{1,2}/[0-9]{1,2}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(ph.`LAST RXDATE`), ' ', 1), '%Y/%m/%d')
      ELSE NULL
    END AS event_date,
    NULLIF(TRIM(ph.`EMAIL`), ''),
    NULLIF(TRIM(ph.`AREA`), ''),
    NULLIF(TRIM(ph.`XCHG`), ''),
    NULLIF(TRIM(ph.`NBR`), ''),
    NULLIF(TRIM(ph.`ADDRESS1`), ''),
    NULLIF(TRIM(ph.`ADDRESS2`), ''),
    NULLIF(TRIM(ph.`CITY`), ''),
    NULLIF(TRIM(ph.`STATE`), ''),
    NULLIF(TRIM(ph.`ZIP`), '')
  FROM pharmacy_insurance_export ph
  WHERE NULLIF(TRIM(ph.`PAT KEY`), '') IS NOT NULL;

  DROP TEMPORARY TABLE IF EXISTS tmp_pharm_max;
  CREATE TEMPORARY TABLE tmp_pharm_max AS
  SELECT pat_key, MAX(event_date) AS max_event_date
  FROM tmp_pharm_events
  GROUP BY pat_key;

  ALTER TABLE tmp_pharm_max ADD PRIMARY KEY (pat_key);

  DROP TEMPORARY TABLE IF EXISTS tmp_pharm_last;
  CREATE TEMPORARY TABLE tmp_pharm_last AS
  SELECT
    e.pat_key,
    MAX(e.email)    AS email,
    MAX(e.area)     AS area,
    MAX(e.xchg)     AS xchg,
    MAX(e.nbr)      AS nbr,
    MAX(e.address1) AS address1,
    MAX(e.address2) AS address2,
    MAX(e.city)     AS city,
    MAX(e.state)    AS state,
    MAX(e.zip)      AS zip
  FROM tmp_pharm_events e
  JOIN tmp_pharm_max m ON m.pat_key = e.pat_key
  WHERE (m.max_event_date IS NOT NULL AND e.event_date = m.max_event_date)
     OR (m.max_event_date IS NULL AND e.event_date IS NULL)
  GROUP BY e.pat_key;

  ALTER TABLE tmp_pharm_last ADD PRIMARY KEY (pat_key);

  UPDATE person p
  JOIN tmp_pharm_last ph ON ph.pat_key = p.pharmacy_pat_key
  SET
    p.email = COALESCE(p.email, ph.email),
    p.phone_e164 = COALESCE(
      p.phone_e164,
      CASE
        WHEN ph.area IS NULL OR ph.xchg IS NULL OR ph.nbr IS NULL THEN NULL
        ELSE
          CASE
            WHEN LENGTH(REGEXP_REPLACE(CONCAT(ph.area, ph.xchg, ph.nbr), '[^0-9]', '')) = 10
              THEN CONCAT('+1', REGEXP_REPLACE(CONCAT(ph.area, ph.xchg, ph.nbr), '[^0-9]', ''))
            ELSE NULL
          END
      END
    ),
    p.address1 = COALESCE(p.address1, ph.address1),
    p.address2 = COALESCE(p.address2, ph.address2),
    p.city     = COALESCE(p.city,     ph.city),
    p.state    = COALESCE(p.state,    ph.state),
    p.zip      = COALESCE(p.zip,      ph.zip)
  WHERE
    p.email IS NULL
    OR p.phone_e164 IS NULL
    OR p.address1 IS NULL
    OR p.city IS NULL
    OR p.state IS NULL
    OR p.zip IS NULL;

  /* =====================================================
     3) CLINIC (lowest) – SAFE parse patientlastseend
     ===================================================== */
  DROP TEMPORARY TABLE IF EXISTS tmp_clinic_raw;
  CREATE TEMPORARY TABLE tmp_clinic_raw (
    patient_id      BIGINT UNSIGNED NOT NULL,
    last_seen       DATE NULL,
    address1        VARCHAR(255) NULL,
    address2        VARCHAR(255) NULL,
    city            VARCHAR(100) NULL,
    state           CHAR(2)      NULL,
    zip             VARCHAR(10)  NULL,
    language        VARCHAR(50)  NULL,
    work_status     VARCHAR(255) NULL,
    education_level VARCHAR(100) NULL,
    homeless_raw    VARCHAR(50)  NULL,
    family_size     TINYINT UNSIGNED NULL,
    income          DECIMAL(13,2) NULL,
    KEY ix_cl (patient_id, last_seen)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_clinic_raw
    (patient_id, last_seen, address1, address2, city, state, zip, language, work_status, education_level, homeless_raw, family_size, income)
  SELECT
    CAST(NULLIF(TRIM(cm.`patientid`), '') AS UNSIGNED) AS patient_id,

    CASE
      WHEN NULLIF(TRIM(cm.`patientlastseend`), '') IS NULL THEN NULL
      WHEN SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1), '%Y-%m-%d')
      WHEN SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1), '%m/%d/%Y')
      WHEN SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1), '%m-%d-%Y')
      WHEN SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1) REGEXP '^[0-9]{4}/[0-9]{1,2}/[0-9]{1,2}$'
        THEN STR_TO_DATE(SUBSTRING_INDEX(TRIM(cm.`patientlastseend`), ' ', 1), '%Y/%m/%d')
      ELSE NULL
    END AS last_seen,

    NULLIF(TRIM(cm.`patient address1`), ''),
    NULLIF(TRIM(cm.`patient address2`), ''),
    NULLIF(TRIM(cm.`patient city`), ''),
    NULLIF(TRIM(cm.`patient state`), ''),
    NULLIF(TRIM(cm.`patient zip`), ''),
    NULLIF(TRIM(cm.`patient lang`), ''),
    NULLIF(TRIM(cm.`ptnt wrk stts`), ''),
    NULLIF(TRIM(cm.`ptnt d lvl`), ''),
    NULLIF(TRIM(cm.`homelessstatus`), ''),
    CASE
      WHEN NULLIF(TRIM(cm.`familysize`), '') REGEXP '^[0-9]+$' THEN CAST(TRIM(cm.`familysize`) AS UNSIGNED)
      ELSE NULL
    END,
    CASE
      WHEN NULLIF(TRIM(cm.`income`), '') IS NULL THEN NULL
      WHEN REPLACE(REPLACE(TRIM(cm.`income`), '$', ''), ',', '') REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
        THEN CAST(REPLACE(REPLACE(TRIM(cm.`income`), '$', ''), ',', '') AS DECIMAL(13,2))
      ELSE NULL
    END
  FROM clinic_merged_export cm
  WHERE NULLIF(TRIM(cm.`patientid`), '') IS NOT NULL;

  DROP TEMPORARY TABLE IF EXISTS tmp_clinic_max;
  CREATE TEMPORARY TABLE tmp_clinic_max AS
  SELECT patient_id, MAX(last_seen) AS max_last_seen
  FROM tmp_clinic_raw
  GROUP BY patient_id;

  ALTER TABLE tmp_clinic_max ADD PRIMARY KEY (patient_id);

  DROP TEMPORARY TABLE IF EXISTS tmp_clinic_last;
  CREATE TEMPORARY TABLE tmp_clinic_last AS
  SELECT
    r.patient_id,
    MAX(r.address1)        AS address1,
    MAX(r.address2)        AS address2,
    MAX(r.city)            AS city,
    MAX(r.state)           AS state,
    MAX(r.zip)             AS zip,
    MAX(r.language)        AS language,
    MAX(r.work_status)     AS work_status,
    MAX(r.education_level) AS education_level,
    MAX(r.homeless_raw)    AS homeless_raw,
    MAX(r.family_size)     AS family_size,
    MAX(r.income)          AS income
  FROM tmp_clinic_raw r
  JOIN tmp_clinic_max m ON m.patient_id = r.patient_id
  WHERE (m.max_last_seen IS NOT NULL AND r.last_seen = m.max_last_seen)
     OR (m.max_last_seen IS NULL AND r.last_seen IS NULL)
  GROUP BY r.patient_id;

  ALTER TABLE tmp_clinic_last ADD PRIMARY KEY (patient_id);

  UPDATE person p
  JOIN tmp_clinic_last cl ON cl.patient_id = p.clinic_patientid
  SET
    p.address1          = COALESCE(p.address1, cl.address1),
    p.address2          = COALESCE(p.address2, cl.address2),
    p.city              = COALESCE(p.city,     cl.city),
    p.state             = COALESCE(p.state,    cl.state),
    p.zip               = COALESCE(p.zip,      cl.zip),
    p.primary_language  = COALESCE(p.primary_language, cl.language),
    p.employment_status = COALESCE(p.employment_status, cl.work_status),
    p.education_level   = COALESCE(p.education_level, cl.education_level),
    p.household_size    = COALESCE(p.household_size, cl.family_size),
    p.monthly_income    = COALESCE(p.monthly_income, cl.income)
  WHERE
    p.address1 IS NULL
    OR p.city IS NULL
    OR p.zip IS NULL
    OR p.primary_language IS NULL
    OR p.employment_status IS NULL
    OR p.education_level IS NULL
    OR p.household_size IS NULL
    OR p.monthly_income IS NULL;

  UPDATE person p
  JOIN tmp_clinic_last cl ON cl.patient_id = p.clinic_patientid
  SET p.homeless_status =
    CASE
      WHEN cl.homeless_raw IS NULL OR TRIM(cl.homeless_raw) = '' THEN NULL
      WHEN UPPER(TRIM(cl.homeless_raw)) IN ('Y','YES','TRUE','1') THEN 'Y'
      WHEN UPPER(TRIM(cl.homeless_raw)) IN ('N','NO','FALSE','0') THEN 'N'
      WHEN UPPER(TRIM(cl.homeless_raw)) IN ('U','UNK','UNKNOWN') THEN 'U'
      ELSE 'U'
    END
  WHERE p.homeless_status IS NULL;

END ;;
DELIMITER ;

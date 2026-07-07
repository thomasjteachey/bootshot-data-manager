DELIMITER ;;
CREATE DEFINER=`brokilodeluxe`@`%` PROCEDURE `merge_person_from_exports_with_audit`()
BEGIN
  /* ============================================================
     STEP 1: Dedup sources into 1 row per external ID
     ============================================================ */

  /* -------------------------
     A) CLINIC (patientid)
     ------------------------- */
  DROP TEMPORARY TABLE IF EXISTS tmp_clinic_by_patientid;
  CREATE TEMPORARY TABLE tmp_clinic_by_patientid (
    patientid_u      BIGINT UNSIGNED NOT NULL,
    fn_up            VARCHAR(100) NOT NULL,
    ln_up            VARCHAR(100) NOT NULL,
    dob_d            DATE NULL,
    sex_norm         ENUM('M','F','X','U') NULL,
    race_txt         VARCHAR(100) NULL,
    ethnicity_txt    VARCHAR(255) NULL,
    homeless_norm    ENUM('Y','N','U') NULL,
    familysize_u     TINYINT UNSIGNED NULL,
    income_amt       DECIMAL(13,2) NULL,
    last_appt_d      DATE NULL,
    PRIMARY KEY (patientid_u),
    KEY ix_name_dob (ln_up, fn_up, dob_d)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_clinic_by_patientid
    (patientid_u, fn_up, ln_up, dob_d, sex_norm, race_txt, ethnicity_txt,
     homeless_norm, familysize_u, income_amt, last_appt_d)
  SELECT
    CAST(TRIM(x.patientid) AS UNSIGNED)                                            AS patientid_u,
    LEFT(UPPER(TRIM(x.first_name)), 100)                                           AS fn_up,
    LEFT(UPPER(TRIM(x.last_name)),  100)                                           AS ln_up,
    x.dob_d                                                                        AS dob_d,
    bootshot.norm_sex(x.patient_sex)                                               AS sex_norm,
    NULLIF(TRIM(x.race), '')                                                       AS race_txt,
    NULLIF(TRIM(x.ethnicity), '')                                                  AS ethnicity_txt,
    CASE
      WHEN UPPER(TRIM(x.homeless_status)) IN ('Y','N','U') THEN UPPER(TRIM(x.homeless_status))
      ELSE NULL
    END                                                                            AS homeless_norm,
    CASE
      WHEN x.familysize IS NOT NULL AND TRIM(x.familysize) REGEXP '^[0-9]+$'
        THEN CAST(TRIM(x.familysize) AS UNSIGNED)
      ELSE NULL
    END                                                                            AS familysize_u,
    CASE
      WHEN x.income IS NULL OR TRIM(x.income) = '' THEN NULL
      WHEN REPLACE(TRIM(x.income), ',', '') REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
        THEN CAST(REPLACE(TRIM(x.income), ',', '') AS DECIMAL(13,2))
      ELSE NULL
    END                                                                            AS income_amt,
    x.last_appt_d                                                                  AS last_appt_d
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(cm.`patientid`), ''), NULLIF(TRIM(cd.`patientid`), '')) AS patientid,

      MAX(
        CASE
          WHEN NULLIF(TRIM(cm.`patient firstname`), '') IS NOT NULL THEN TRIM(cm.`patient firstname`)
          WHEN NULLIF(TRIM(cm.`patient name`), '') IS NULL THEN NULL
          WHEN INSTR(cm.`patient name`, ',') > 0 THEN
            TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(cm.`patient name`, ',', -1), ' ', 1))
          ELSE TRIM(SUBSTRING_INDEX(cm.`patient name`, ' ', 1))
        END
      ) AS first_name,

      MAX(
        CASE
          WHEN NULLIF(TRIM(cm.`patient lastname`), '') IS NOT NULL THEN TRIM(cm.`patient lastname`)
          WHEN NULLIF(TRIM(cm.`patient name`), '') IS NULL THEN NULL
          WHEN INSTR(cm.`patient name`, ',') > 0 THEN
            TRIM(SUBSTRING_INDEX(cm.`patient name`, ',', 1))
          ELSE TRIM(SUBSTRING_INDEX(cm.`patient name`, ' ', -1))
        END
      ) AS last_name,

      MAX(
        CASE
          WHEN cm.`patientdob` IS NULL OR TRIM(cm.`patientdob`) = '' THEN NULL
          WHEN TRIM(cm.`patientdob`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(cm.`patientdob`), '%Y-%m-%d')
          WHEN TRIM(cm.`patientdob`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
            COALESCE(
              STR_TO_DATE(TRIM(cm.`patientdob`), '%m/%d/%Y'),
              STR_TO_DATE(TRIM(cm.`patientdob`), '%m/%d/%y')
            )
          ELSE NULL
        END
      ) AS dob_d,

      MAX(NULLIF(TRIM(COALESCE(cm.`patientsex`, cm.`pat gender`)), ''))            AS patient_sex,
      MAX(NULLIF(TRIM(cm.`race`), ''))                                            AS race,
      MAX(NULLIF(TRIM(cm.`ethnicity`), ''))                                       AS ethnicity,
      MAX(NULLIF(TRIM(cm.`homelessstatus`), ''))                                  AS homeless_status,
      MAX(NULLIF(TRIM(cm.`familysize`), ''))                                      AS familysize,
      MAX(NULLIF(TRIM(cm.`income`), ''))                                          AS income,

      MAX(
        CASE
          WHEN cd.`apptdate` IS NULL OR TRIM(cd.`apptdate`) = '' THEN NULL
          WHEN TRIM(cd.`apptdate`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(cd.`apptdate`), '%Y-%m-%d')
          WHEN TRIM(cd.`apptdate`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
            COALESCE(
              STR_TO_DATE(TRIM(cd.`apptdate`), '%m/%d/%Y'),
              STR_TO_DATE(TRIM(cd.`apptdate`), '%m/%d/%y')
            )
          ELSE NULL
        END
      ) AS last_appt_d

    FROM clinic_merged_export cm
    LEFT JOIN clinic_dob_export cd
      ON NULLIF(TRIM(cd.`patientid`), '') = NULLIF(TRIM(cm.`patientid`), '')
    GROUP BY COALESCE(NULLIF(TRIM(cm.`patientid`), ''), NULLIF(TRIM(cd.`patientid`), ''))
  ) x
  WHERE TRIM(x.patientid) REGEXP '^[0-9]+$'
    AND NULLIF(TRIM(x.first_name), '') IS NOT NULL
    AND NULLIF(TRIM(x.last_name), '') IS NOT NULL
    AND x.dob_d IS NOT NULL;


  /* -------------------------
     B) PHARMACY (PAT KEY)
     ------------------------- */
  DROP TEMPORARY TABLE IF EXISTS tmp_pharm_ins_dedup;
  CREATE TEMPORARY TABLE tmp_pharm_ins_dedup (
    pat_key_u       BIGINT UNSIGNED NOT NULL,
    fn_up           VARCHAR(100) NOT NULL,
    ln_up           VARCHAR(100) NOT NULL,
    dob_d           DATE NULL,
    sex_norm        ENUM('M','F','X','U') NULL,
    email_txt       VARCHAR(254) NULL,
    phone_raw_txt   VARCHAR(255) NULL,
    phone_e164_txt  VARCHAR(20) NULL,
    address1_txt    VARCHAR(255) NULL,
    address2_txt    VARCHAR(255) NULL,
    city_txt        VARCHAR(100) NULL,
    state_txt       CHAR(2) NULL,
    zip_txt         VARCHAR(10) NULL,
    PRIMARY KEY (pat_key_u),
    KEY ix_name_dob (ln_up, fn_up, dob_d)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_pharm_ins_dedup
    (pat_key_u, fn_up, ln_up, dob_d, sex_norm, email_txt, phone_raw_txt,
     address1_txt, address2_txt, city_txt, state_txt, zip_txt)
  SELECT
    CAST(TRIM(ph.`PAT KEY`) AS UNSIGNED)                                         AS pat_key_u,
    LEFT(UPPER(TRIM(MAX(ph.`FIRST NAME`))), 100)                                 AS fn_up,
    LEFT(UPPER(TRIM(MAX(ph.`LAST NAME`))),  100)                                 AS ln_up,
    MAX(
      CASE
        WHEN ph.`BIRTHDAY` IS NULL OR TRIM(ph.`BIRTHDAY`) = '' THEN NULL
        WHEN TRIM(ph.`BIRTHDAY`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(ph.`BIRTHDAY`), '%Y-%m-%d')
        WHEN TRIM(ph.`BIRTHDAY`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
          COALESCE(
            STR_TO_DATE(TRIM(ph.`BIRTHDAY`), '%m/%d/%Y'),
            STR_TO_DATE(TRIM(ph.`BIRTHDAY`), '%m/%d/%y')
          )
        ELSE NULL
      END
    )                                                                              AS dob_d,
    bootshot.norm_sex(MAX(NULLIF(TRIM(ph.`SEX`), '')))                             AS sex_norm,
    MAX(NULLIF(TRIM(ph.`EMAIL`), ''))                                              AS email_txt,
    /* raw phone composed from AREA/XCHG/NBR */
    MAX(
      NULLIF(
        CONCAT(
          NULLIF(TRIM(ph.`AREA`), ''),
          NULLIF(TRIM(ph.`XCHG`), ''),
          NULLIF(TRIM(ph.`NBR`), '')
        ),
        ''
      )
    )                                                                              AS phone_raw_txt,
    LEFT(MAX(NULLIF(TRIM(ph.`ADDRESS1`), '')), 255)                                AS address1_txt,
    LEFT(MAX(NULLIF(TRIM(ph.`ADDRESS2`), '')), 255)                                AS address2_txt,
    LEFT(MAX(NULLIF(TRIM(ph.`CITY`), '')), 100)                                    AS city_txt,
    LEFT(MAX(NULLIF(TRIM(ph.`STATE`), '')), 2)                                     AS state_txt,
    LEFT(MAX(NULLIF(TRIM(ph.`ZIP`), '')), 10)                                      AS zip_txt
  FROM pharmacy_insurance_export ph
  WHERE TRIM(ph.`PAT KEY`) REGEXP '^[0-9]+$'
  GROUP BY CAST(TRIM(ph.`PAT KEY`) AS UNSIGNED);

  /* normalize pharmacy phone into phone_e164_txt */
  UPDATE tmp_pharm_ins_dedup
  SET phone_e164_txt =
    CASE
      WHEN phone_raw_txt IS NULL OR TRIM(phone_raw_txt) = '' THEN NULL
      ELSE
        CASE
          WHEN LENGTH(REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', '')) = 11
               AND LEFT(REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', ''), 1) = '1'
            THEN CONCAT('+', REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', ''))
          WHEN LENGTH(REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', '')) = 10
            THEN CONCAT('+1', REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', ''))
          WHEN LENGTH(REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', '')) BETWEEN 12 AND 15
            THEN CONCAT('+', REGEXP_REPLACE(TRIM(phone_raw_txt), '[^0-9]', ''))
          ELSE NULL
        END
    END;


  /* pickup dates (kept if you want later, not used in person insert) */
  DROP TEMPORARY TABLE IF EXISTS tmp_pharm_pickup_dedup;
  CREATE TEMPORARY TABLE tmp_pharm_pickup_dedup (
    pat_key_u       BIGINT UNSIGNED NOT NULL,
    last_pickup_d   DATE NULL,
    PRIMARY KEY (pat_key_u)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_pharm_pickup_dedup (pat_key_u, last_pickup_d)
  SELECT
    CAST(TRIM(pp.`PAT KEY`) AS UNSIGNED)                                          AS pat_key_u,
    MAX(
      CASE
        WHEN pp.`DT` IS NULL OR TRIM(pp.`DT`) = '' THEN NULL
        WHEN TRIM(pp.`DT`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(pp.`DT`), '%Y-%m-%d')
        WHEN TRIM(pp.`DT`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
          COALESCE(
            STR_TO_DATE(TRIM(pp.`DT`), '%m/%d/%Y'),
            STR_TO_DATE(TRIM(pp.`DT`), '%m/%d/%y')
          )
        ELSE NULL
      END
    ) AS last_pickup_d
  FROM pharmacy_pickup_date_export pp
  WHERE TRIM(pp.`PAT KEY`) REGEXP '^[0-9]+$'
  GROUP BY CAST(TRIM(pp.`PAT KEY`) AS UNSIGNED);


  /* -------------------------
     C) PANTRY (Client ID)
     ------------------------- */
  DROP TEMPORARY TABLE IF EXISTS tmp_pantry_by_client;
  CREATE TEMPORARY TABLE tmp_pantry_by_client (
    client_id_u        BIGINT UNSIGNED NOT NULL,
    fn_up              VARCHAR(100) NOT NULL,
    ln_up              VARCHAR(100) NOT NULL,
    dob_d              DATE NULL,
    last_visit_d       DATE NULL,
    gender_id_txt      VARCHAR(255) NULL,
    ethnicity_txt      VARCHAR(255) NULL,
    email_txt          VARCHAR(254) NULL,
    phone_raw_txt      TEXT NULL,
    phone_e164_txt     VARCHAR(20) NULL,
    address1_txt       VARCHAR(255) NULL,
    address2_txt       VARCHAR(255) NULL,
    city_txt           VARCHAR(100) NULL,
    state_txt          CHAR(2) NULL,
    zip_txt            VARCHAR(10) NULL,
    housing_txt        VARCHAR(100) NULL,
    household_size_u   TINYINT UNSIGNED NULL,
    monthly_income_amt DECIMAL(13,2) NULL,
    PRIMARY KEY (client_id_u),
    KEY ix_name_dob (ln_up, fn_up, dob_d)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_pantry_by_client
    (client_id_u, fn_up, ln_up, dob_d, last_visit_d,
     gender_id_txt, ethnicity_txt, email_txt, phone_raw_txt,
     address1_txt, address2_txt, city_txt, state_txt, zip_txt,
     housing_txt, household_size_u, monthly_income_amt)
  SELECT
    CAST(TRIM(pe.`Client ID`) AS UNSIGNED)                                     AS client_id_u,
    LEFT(UPPER(TRIM(MAX(pe.`Client First Name`))), 100)                        AS fn_up,
    LEFT(UPPER(TRIM(MAX(pe.`Client Last Name`))),  100)                        AS ln_up,

    MAX(
      CASE
        WHEN pe.`Client Date of Birth` IS NULL OR TRIM(pe.`Client Date of Birth`) = '' THEN NULL
        WHEN TRIM(pe.`Client Date of Birth`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(pe.`Client Date of Birth`), '%Y-%m-%d')
        WHEN TRIM(pe.`Client Date of Birth`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
          COALESCE(
            STR_TO_DATE(TRIM(pe.`Client Date of Birth`), '%m/%d/%Y'),
            STR_TO_DATE(TRIM(pe.`Client Date of Birth`), '%m/%d/%y')
          )
        ELSE NULL
      END
    ) AS dob_d,

    MAX(
      CASE
        WHEN pe.`Visit Date` IS NULL OR TRIM(pe.`Visit Date`) = '' THEN NULL
        WHEN TRIM(pe.`Visit Date`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(pe.`Visit Date`), '%Y-%m-%d')
        WHEN TRIM(pe.`Visit Date`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
          COALESCE(
            STR_TO_DATE(TRIM(pe.`Visit Date`), '%m/%d/%Y'),
            STR_TO_DATE(TRIM(pe.`Visit Date`), '%m/%d/%y')
          )
        ELSE NULL
      END
    ) AS last_visit_d,

    LEFT(MAX(NULLIF(TRIM(pe.`Client Gender Identity-Labels`), '')), 255)       AS gender_id_txt,
    LEFT(MAX(NULLIF(TRIM(pe.`Client Ethnicity-Labels`), '')), 255)             AS ethnicity_txt,
    LEFT(MAX(NULLIF(TRIM(pe.`Client Email Addresses`), '')), 254)              AS email_txt,
    MAX(NULLIF(TRIM(pe.`Client Phone Numbers`), ''))                           AS phone_raw_txt,

    LEFT(MAX(NULLIF(TRIM(pe.`Street`), '')), 255)                              AS address1_txt,
    LEFT(MAX(NULLIF(TRIM(pe.`Line 2`), '')), 255)                              AS address2_txt,
    LEFT(MAX(NULLIF(TRIM(pe.`City`), '')), 100)                                AS city_txt,
    LEFT(MAX(NULLIF(TRIM(pe.`State`), '')), 2)                                 AS state_txt,
    LEFT(MAX(NULLIF(TRIM(pe.`Zip Code`), '')), 10)                             AS zip_txt,

    LEFT(MAX(NULLIF(TRIM(pe.`Housing Type`), '')), 100)                        AS housing_txt,

    MAX(
      CASE
        WHEN pe.`Household Size` IS NOT NULL AND TRIM(pe.`Household Size`) REGEXP '^[0-9]+$'
          THEN CAST(TRIM(pe.`Household Size`) AS UNSIGNED)
        ELSE NULL
      END
    ) AS household_size_u,

    MAX(
      CASE
        WHEN pe.`Monthly Household Income` IS NULL OR TRIM(pe.`Monthly Household Income`) = '' THEN NULL
        WHEN REPLACE(TRIM(pe.`Monthly Household Income`), ',', '') REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
          THEN CAST(REPLACE(TRIM(pe.`Monthly Household Income`), ',', '') AS DECIMAL(13,2))
        ELSE NULL
      END
    ) AS monthly_income_amt

  FROM pantry_export pe
  WHERE TRIM(pe.`Client ID`) REGEXP '^[0-9]+$'
  GROUP BY CAST(TRIM(pe.`Client ID`) AS UNSIGNED);

  /* normalize pantry phone: first token before ; , or / */
  UPDATE tmp_pantry_by_client
  SET phone_e164_txt =
    CASE
      WHEN phone_raw_txt IS NULL OR TRIM(phone_raw_txt) = '' THEN NULL
      ELSE
        CASE
          WHEN LENGTH(
                 REGEXP_REPLACE(
                   TRIM(
                     SUBSTRING_INDEX(
                       SUBSTRING_INDEX(
                         SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                       ',', 1),
                     '/', 1)
                   ),
                   '[^0-9]', ''
                 )
               ) = 11
               AND LEFT(
                 REGEXP_REPLACE(
                   TRIM(
                     SUBSTRING_INDEX(
                       SUBSTRING_INDEX(
                         SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                       ',', 1),
                     '/', 1)
                   ),
                   '[^0-9]', ''
                 ),
                 1
               ) = '1'
            THEN CONCAT(
              '+',
              REGEXP_REPLACE(
                TRIM(
                  SUBSTRING_INDEX(
                    SUBSTRING_INDEX(
                      SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                    ',', 1),
                  '/', 1)
                ),
                '[^0-9]', ''
              )
            )
          WHEN LENGTH(
                 REGEXP_REPLACE(
                   TRIM(
                     SUBSTRING_INDEX(
                       SUBSTRING_INDEX(
                         SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                       ',', 1),
                     '/', 1)
                   ),
                   '[^0-9]', ''
                 )
               ) = 10
            THEN CONCAT(
              '+1',
              REGEXP_REPLACE(
                TRIM(
                  SUBSTRING_INDEX(
                    SUBSTRING_INDEX(
                      SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                    ',', 1),
                  '/', 1)
                ),
                '[^0-9]', ''
              )
            )
          WHEN LENGTH(
                 REGEXP_REPLACE(
                   TRIM(
                     SUBSTRING_INDEX(
                       SUBSTRING_INDEX(
                         SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                       ',', 1),
                     '/', 1)
                   ),
                   '[^0-9]', ''
                 )
               ) BETWEEN 12 AND 15
            THEN CONCAT(
              '+',
              REGEXP_REPLACE(
                TRIM(
                  SUBSTRING_INDEX(
                    SUBSTRING_INDEX(
                      SUBSTRING_INDEX(phone_raw_txt, ';', 1),
                    ',', 1),
                  '/', 1)
                ),
                '[^0-9]', ''
              )
            )
          ELSE NULL
        END
    END;


  /* ============================================================
     STEP 2: Upsert into person
     ============================================================ */

  /* Clinic -> person */
  INSERT INTO person
    (last_name, first_name, dob,
     sex_at_birth, race, ethnicity, homeless_status, household_size, monthly_income,
     clinic_patientid)
  SELECT
    c.ln_up, c.fn_up, c.dob_d,
    c.sex_norm, c.race_txt, c.ethnicity_txt, c.homeless_norm, c.familysize_u, c.income_amt,
    c.patientid_u
  FROM tmp_clinic_by_patientid c
  ON DUPLICATE KEY UPDATE
    clinic_patientid = CASE
      WHEN person.clinic_patientid IS NULL OR person.clinic_patientid = 0 THEN VALUES(clinic_patientid)
      ELSE person.clinic_patientid
    END,
    sex_at_birth    = COALESCE(person.sex_at_birth, VALUES(sex_at_birth)),
    race            = COALESCE(person.race, VALUES(race)),
    ethnicity       = COALESCE(person.ethnicity, VALUES(ethnicity)),
    homeless_status = COALESCE(person.homeless_status, VALUES(homeless_status)),
    household_size  = COALESCE(person.household_size, VALUES(household_size)),
    monthly_income  = COALESCE(person.monthly_income, VALUES(monthly_income));

  /* Pharmacy -> person (store raw + normalized phone) */
  INSERT INTO person
    (last_name, first_name, dob,
     sex_at_birth, email, phone_e164, phone_raw, address1, address2, city, state, zip,
     pharmacy_pat_key)
  SELECT
    pi.ln_up, pi.fn_up, pi.dob_d,
    pi.sex_norm, pi.email_txt, pi.phone_e164_txt, pi.phone_raw_txt,
    pi.address1_txt, pi.address2_txt, pi.city_txt, pi.state_txt, pi.zip_txt,
    pi.pat_key_u
  FROM tmp_pharm_ins_dedup pi
  WHERE pi.dob_d IS NOT NULL
  ON DUPLICATE KEY UPDATE
    pharmacy_pat_key = CASE
      WHEN person.pharmacy_pat_key IS NULL OR person.pharmacy_pat_key = 0 THEN VALUES(pharmacy_pat_key)
      ELSE person.pharmacy_pat_key
    END,
    sex_at_birth  = COALESCE(person.sex_at_birth, VALUES(sex_at_birth)),
    email         = COALESCE(person.email, VALUES(email)),
    phone_e164    = COALESCE(person.phone_e164, VALUES(phone_e164)),
    phone_raw     = COALESCE(person.phone_raw, VALUES(phone_raw)),
    address1      = COALESCE(person.address1, VALUES(address1)),
    address2      = COALESCE(person.address2, VALUES(address2)),
    city          = COALESCE(person.city, VALUES(city)),
    state         = COALESCE(person.state, VALUES(state)),
    zip           = COALESCE(person.zip, VALUES(zip));

  /* Pantry -> person (store raw + normalized phone) */
  INSERT INTO person
    (last_name, first_name, dob,
     gender_identity, ethnicity, email, phone_e164, phone_raw, address1, address2, city, state, zip,
     housing_type, household_size, monthly_income,
     pantry_client_id)
  SELECT
    t.ln_up, t.fn_up, t.dob_d,
    t.gender_id_txt, t.ethnicity_txt, t.email_txt, t.phone_e164_txt, t.phone_raw_txt,
    t.address1_txt, t.address2_txt, t.city_txt, t.state_txt, t.zip_txt,
    t.housing_txt, t.household_size_u, t.monthly_income_amt,
    t.client_id_u
  FROM tmp_pantry_by_client t
  WHERE t.dob_d IS NOT NULL
  ON DUPLICATE KEY UPDATE
    pantry_client_id = CASE
      WHEN person.pantry_client_id IS NULL OR person.pantry_client_id = 0 THEN VALUES(pantry_client_id)
      ELSE person.pantry_client_id
    END,
    gender_identity = COALESCE(person.gender_identity, VALUES(gender_identity)),
    ethnicity       = COALESCE(person.ethnicity, VALUES(ethnicity)),
    email           = COALESCE(person.email, VALUES(email)),
    phone_e164      = COALESCE(person.phone_e164, VALUES(phone_e164)),
    phone_raw       = COALESCE(person.phone_raw, VALUES(phone_raw)),
    address1        = COALESCE(person.address1, VALUES(address1)),
    address2        = COALESCE(person.address2, VALUES(address2)),
    city            = COALESCE(person.city, VALUES(city)),
    state           = COALESCE(person.state, VALUES(state)),
    zip             = COALESCE(person.zip, VALUES(zip)),
    housing_type    = COALESCE(person.housing_type, VALUES(housing_type)),
    household_size  = COALESCE(person.household_size, VALUES(household_size)),
    monthly_income  = COALESCE(person.monthly_income, VALUES(monthly_income));

  /* ============================================================
     STEP 3: enforce ALL CAPS for names
     ============================================================ */
  UPDATE person p
  SET p.first_name = UPPER(TRIM(p.first_name)),
      p.last_name  = UPPER(TRIM(p.last_name))
  WHERE (p.first_name IS NOT NULL AND p.first_name <> UPPER(TRIM(p.first_name)))
     OR (p.last_name  IS NOT NULL AND p.last_name  <> UPPER(TRIM(p.last_name)));

END ;;
DELIMITER ;

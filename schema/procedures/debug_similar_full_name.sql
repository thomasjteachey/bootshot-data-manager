DELIMITER ;;
CREATE DEFINER=`brokilodeluxe`@`%` PROCEDURE `debug_similar_full_name`(
    IN p_min_ratio_first   DECIMAL(5,4),  -- e.g. 0.90
    IN p_min_ratio_last    DECIMAL(5,4),  -- e.g. 0.90
    IN p_same_dob          TINYINT(1),    -- 1 = require same DOB
    IN p_use_soundex_pref  TINYINT(1),    -- 1 = require SOUNDEX match on both names (faster)
    IN p_limit_rows        INT            -- e.g. 500
)
BEGIN
  DECLARE v_limit INT DEFAULT 500;

  SET v_limit = IFNULL(p_limit_rows, 500);

  WITH base AS (
    SELECT
      p.person_id,
      p.first_name,
      p.last_name,
      UPPER(TRIM(p.first_name)) AS fn_norm,
      UPPER(TRIM(p.last_name))  AS ln_norm,
      SOUNDEX(UPPER(TRIM(p.first_name))) AS fn_sdx,
      SOUNDEX(UPPER(TRIM(p.last_name)))  AS ln_sdx,
      p.dob
    FROM person p
    WHERE p.first_name IS NOT NULL AND TRIM(p.first_name) <> ''
      AND p.last_name  IS NOT NULL AND TRIM(p.last_name)  <> ''
  )
  SELECT
      a.person_id AS person_id_a,
      b.person_id AS person_id_b,
      a.first_name AS first_a,
      b.first_name AS first_b,
      a.last_name  AS last_a,
      b.last_name  AS last_b,
      DATE_FORMAT(a.dob,'%Y-%m-%d') AS dob_a,
      DATE_FORMAT(b.dob,'%Y-%m-%d') AS dob_b,
      bootshot_name_sim_ratio(a.fn_norm, b.fn_norm) AS sim_first,
      bootshot_name_sim_ratio(a.ln_norm, b.ln_norm) AS sim_last,
      ROUND(
        (bootshot_name_sim_ratio(a.fn_norm, b.fn_norm)
        + bootshot_name_sim_ratio(a.ln_norm, b.ln_norm)) / 2
      , 4) AS sim_avg,
      HEX(a.first_name) AS first_a_hex,
      HEX(b.first_name) AS first_b_hex,
      HEX(a.last_name)  AS last_a_hex,
      HEX(b.last_name)  AS last_b_hex
  FROM base a
  JOIN base b
    ON a.person_id < b.person_id
   AND (p_same_dob = 0 OR (a.dob <=> b.dob))
   AND (
         p_use_soundex_pref = 0
         OR (a.fn_sdx = b.fn_sdx AND a.ln_sdx = b.ln_sdx)
       )
  HAVING sim_first >= p_min_ratio_first
     AND sim_last  >= p_min_ratio_last
  ORDER BY sim_avg DESC, last_a, first_a
  LIMIT v_limit;
END ;;
DELIMITER ;
